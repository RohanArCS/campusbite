"""AI order insights backed by the OpenAI API.

Only the authenticated customer's own orders are loaded and sent as context, so the model
never sees another customer's data regardless of what the question asks.
"""

import json
import logging
import threading
import time
from collections import Counter, defaultdict, deque
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..models import Order, OrderStatus, User, utcnow
from .orders import ACTIVE_STATUSES

logger = logging.getLogger("campusbite.ai")

SYSTEM_PROMPT = """You are CampusBite's order-insights assistant.
You answer questions about ONE customer's food order history, using ONLY the JSON data provided.
Rules:
- Never invent orders, amounts or dishes that are not in the data.
- If the data does not contain the answer, say so briefly.
- You only have this customer's data. If asked about other customers, restaurants' private data,
  or anything unrelated to this customer's orders, politely decline.
- Amounts are in Indian Rupees; format them like ₹250.00.
- Dates in the data are UTC ISO timestamps; "today" is given as `today_utc`.
- Use the precomputed `stats` for totals when relevant.
- Keep answers concise and friendly. Use short bullet lists when listing orders.
- Reply in plain text only (it is shown as plain text): no Markdown, no ** or #.
  Start list items with "• "."""


class RateLimiter:
    """Simple in-memory sliding-window limiter (per user, per process)."""

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[int, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry_after = int(self.window - (now - hits[0])) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many AI requests. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)


rate_limiter = RateLimiter(settings.ai_rate_limit_per_minute)


def load_customer_orders(db: Session, customer: User) -> list[Order]:
    return (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.restaurant))
        .filter(Order.customer_id == customer.id)  # <- the authorization boundary
        .order_by(Order.created_at.desc())
        .limit(settings.ai_max_orders)
        .all()
    )


def build_context(orders: list[Order]) -> dict:
    now = utcnow()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    last_7 = now - timedelta(days=7)
    paid = [o for o in orders if o.status not in (OrderStatus.CANCELLED, OrderStatus.REFUNDED)]

    item_counts: Counter[str] = Counter()
    for o in paid:
        for i in o.items:
            item_counts[i.name] += i.quantity

    return {
        "today_utc": now.date().isoformat(),
        "stats": {
            "orders_in_context": len(orders),
            "spent_this_calendar_week": round(sum(float(o.total_amount) for o in paid if o.created_at >= week_start), 2),
            "spent_last_7_days": round(sum(float(o.total_amount) for o in paid if o.created_at >= last_7), 2),
            "spent_all_orders_in_context": round(sum(float(o.total_amount) for o in paid), 2),
            "not_yet_delivered_order_ids": [o.id for o in orders if o.status in ACTIVE_STATUSES],
            "most_ordered_items": item_counts.most_common(5),
            "note": "Spending excludes cancelled and refunded orders.",
        },
        "orders": [
            {
                "order_id": o.id,
                "placed_at": o.created_at.isoformat() + "Z",
                "restaurant": o.restaurant.name,
                "status": o.status.value,
                "payment_status": o.payment_status.value,
                "return_status": o.return_status.value if o.return_status else None,
                "total": float(o.total_amount),
                "items": [
                    {"name": i.name, "qty": i.quantity, "unit_price": float(i.unit_price)}
                    for i in o.items
                ],
            }
            for o in orders
        ],
    }


def fallback_answer(context: dict) -> str:
    """Deterministic summary used when no OpenAI key is configured."""
    orders, stats = context["orders"], context["stats"]
    if not orders:
        return "You haven't placed any orders yet. Browse restaurants to place your first order!"
    lines = ["Here's a quick summary of your recent orders (basic mode, AI not configured):", ""]
    for o in orders[:5]:
        items = ", ".join(f"{i['qty']}× {i['name']}" for i in o["items"])
        lines.append(f"• #{o['order_id']} {o['restaurant']} — {o['status']} — ₹{o['total']:.2f} ({items})")
    pending = stats["not_yet_delivered_order_ids"]
    lines.append("")
    lines.append(
        f"Not yet delivered: {', '.join('#' + str(i) for i in pending)}" if pending
        else "All of your orders have been completed."
    )
    lines.append(f"Spent in the last 7 days: ₹{stats['spent_last_7_days']:.2f}")
    if stats["most_ordered_items"]:
        top = ", ".join(f"{name} ({qty})" for name, qty in stats["most_ordered_items"][:3])
        lines.append(f"Your favourites: {top}")
    return "\n".join(lines)


def ask_openai(context: dict, question: str) -> str:
    from openai import (
        APIConnectionError,
        APIStatusError,
        APITimeoutError,
        AuthenticationError,
        OpenAI,
        RateLimitError,
    )

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        timeout=settings.openai_timeout_seconds,
        max_retries=2,  # SDK retries 429/5xx with exponential backoff
    )
    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            max_tokens=settings.ai_max_output_tokens,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": "Customer order data (JSON):\n"
                    + json.dumps(context, default=str)
                    + f"\n\nQuestion: {question}",
                },
            ],
        )
    except RateLimitError:
        logger.warning("OpenAI rate limit hit")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="The AI service is busy right now. Please try again in a minute.",
            headers={"Retry-After": "30"},
        ) from None
    except AuthenticationError:
        logger.error("OpenAI authentication failed - check OPENAI_API_KEY")
        raise HTTPException(status_code=503, detail="AI service is misconfigured.") from None
    except (APITimeoutError, APIConnectionError):
        raise HTTPException(status_code=504, detail="AI service timed out. Please retry.") from None
    except APIStatusError as exc:
        logger.error("OpenAI error %s: %s", exc.status_code, exc)
        raise HTTPException(status_code=502, detail="AI service returned an error.") from None

    choice = completion.choices[0]
    answer = (choice.message.content or "").strip()
    if not answer:
        return "Sorry, I couldn't generate an answer for that question. Please try rephrasing it."
    if choice.finish_reason == "length":
        logger.warning("AI answer truncated at %s tokens", settings.ai_max_output_tokens)
        answer += " …\n\n(Answer was cut short. Try a more specific question.)"
    return answer
