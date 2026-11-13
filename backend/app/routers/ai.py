from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User, utcnow
from ..schemas import InsightRequest, InsightResponse
from ..security import require_customer
from ..services import ai

router = APIRouter(prefix="/api/ai", tags=["AI Insights"])


@router.post("/insights", response_model=InsightResponse)
async def order_insights(
    data: InsightRequest,
    customer: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Answer a question about the *authenticated* customer's own order history."""
    ai.rate_limiter.check(customer.id)
    orders = await run_in_threadpool(ai.load_customer_orders, db, customer)
    context = ai.build_context(orders)

    if not settings.openai_api_key:
        return InsightResponse(answer=ai.fallback_answer(context), source="fallback",
                               orders_considered=len(orders), generated_at=utcnow())

    answer = await run_in_threadpool(ai.ask_openai, context, data.question.strip())
    return InsightResponse(answer=answer, source="openai", model=settings.openai_model,
                           orders_considered=len(orders), generated_at=utcnow())
