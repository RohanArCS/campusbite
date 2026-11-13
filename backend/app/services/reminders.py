"""Background job: remind restaurant owners about orders stuck in PLACED/ACCEPTED."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models import Order, OrderStatus, ReminderLog, utcnow

logger = logging.getLogger("campusbite.reminders")

STALE_STATUSES = (OrderStatus.PLACED, OrderStatus.ACCEPTED)


def generate_reminders(db: Session, threshold_minutes: int | None = None) -> int:
    """Create one reminder per (order, status) that has been idle beyond the threshold.

    Returns the number of new reminder records created. Safe to run repeatedly.
    """
    minutes = threshold_minutes if threshold_minutes is not None else settings.reminder_threshold_minutes
    cutoff = utcnow() - timedelta(minutes=minutes)

    stale_orders = (
        db.query(Order)
        .filter(Order.status.in_(STALE_STATUSES), Order.status_updated_at <= cutoff)
        .all()
    )
    created = 0
    for order in stale_orders:
        exists = (
            db.query(ReminderLog.id)
            .filter(ReminderLog.order_id == order.id, ReminderLog.order_status == order.status)
            .first()
        )
        if exists:
            continue
        action = "accept or reject" if order.status == OrderStatus.PLACED else "start preparing"
        db.add(
            ReminderLog(
                order_id=order.id,
                restaurant_id=order.restaurant_id,
                order_status=order.status,
                message=(
                    f"Order #{order.id} has been {order.status.value} for more than "
                    f"{minutes} minutes. Please {action} it."
                ),
            )
        )
        created += 1
    try:
        db.commit()
    except IntegrityError:  # another worker created the same reminder concurrently
        db.rollback()
    return created


def run_reminder_job() -> int:
    db = SessionLocal()
    try:
        created = generate_reminders(db)
        if created:
            logger.info("Reminder job created %s reminder(s)", created)
        return created
    finally:
        db.close()


async def reminder_scheduler(stop_event: asyncio.Event) -> None:
    """Periodic loop started from the FastAPI lifespan."""
    interval = max(5, settings.reminder_check_interval_seconds)
    logger.info("Reminder scheduler started (every %ss, threshold %s min)",
                interval, settings.reminder_threshold_minutes)
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(run_reminder_job)
        except Exception:  # noqa: BLE001
            logger.exception("Reminder job failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
