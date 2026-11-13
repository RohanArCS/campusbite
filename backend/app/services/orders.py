"""Order lifecycle rules, payment ledger helpers and response builders.

All business rules for status transitions live here so every router enforces the same
state machine.
"""

import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from ..models import (
    LedgerEntryType,
    Order,
    OrderStatus,
    OrderStatusHistory,
    PaymentLedger,
    PaymentStatus,
    ReminderLog,
    ReturnStatus,
    User,
    UserRole,
    utcnow,
)
from ..schemas import OrderOut, OrderSummaryOut, ReviewOut

C, O, D = UserRole.CUSTOMER, UserRole.RESTAURANT_OWNER, UserRole.DELIVERY_PARTNER

# current status -> {next status: roles allowed to make that move}
TRANSITIONS: dict[OrderStatus, dict[OrderStatus, set[UserRole]]] = {
    OrderStatus.PLACED: {OrderStatus.ACCEPTED: {O}, OrderStatus.CANCELLED: {C, O}},
    OrderStatus.ACCEPTED: {OrderStatus.PREPARING: {O}},
    OrderStatus.PREPARING: {OrderStatus.READY: {O}},
    OrderStatus.READY: {OrderStatus.ASSIGNED: {O}},
    OrderStatus.ASSIGNED: {OrderStatus.OUT_FOR_DELIVERY: {D}},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED: {D}},
    OrderStatus.DELIVERED: {OrderStatus.REFUNDED: {O}},
    OrderStatus.CANCELLED: {},
    OrderStatus.REFUNDED: {},
}

ACTIVE_STATUSES = [
    OrderStatus.PLACED,
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.ASSIGNED,
    OrderStatus.OUT_FOR_DELIVERY,
]

ORDER_LOAD_OPTIONS = (
    selectinload(Order.items),
    selectinload(Order.payments),
    selectinload(Order.history),
    selectinload(Order.restaurant),
    selectinload(Order.customer),
    selectinload(Order.delivery_partner),
    selectinload(Order.review),
    selectinload(Order.return_request),
)


def next_statuses_for(order: Order, role: UserRole) -> list[OrderStatus]:
    return [s for s, roles in TRANSITIONS.get(order.status, {}).items() if role in roles]


def transition(
    db: Session, order: Order, new_status: OrderStatus, actor: User, note: str | None = None
) -> Order:
    """Move an order to a new status, rejecting anything the state machine does not allow."""
    allowed = TRANSITIONS.get(order.status, {})
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid status transition: {order.status.value} -> {new_status.value}",
        )
    if actor.role not in allowed[new_status]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"A {actor.role.value} cannot move an order to {new_status.value}",
        )

    now = utcnow()
    order.history.append(
        OrderStatusHistory(
            order_id=order.id,
            from_status=order.status,
            to_status=new_status,
            changed_by_id=actor.id,
            note=note,
        )
    )
    order.status = new_status
    order.status_updated_at = now
    if new_status == OrderStatus.DELIVERED:
        order.delivered_at = now

    # Any outstanding "stale order" reminders are now obsolete.
    db.query(ReminderLog).filter(
        ReminderLog.order_id == order.id, ReminderLog.is_resolved.is_(False)
    ).update({"is_resolved": True, "resolved_at": now}, synchronize_session=False)
    return order


def new_reference(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def record_mock_payment(db: Session, order: Order) -> PaymentLedger:
    entry = PaymentLedger(
        order_id=order.id,
        entry_type=LedgerEntryType.PAYMENT,
        amount=order.total_amount,
        status=PaymentStatus.MOCK_PAID,
        method=order.payment_method,
        reference=new_reference("MOCKPAY"),
        note="Dummy payment captured (no real gateway)",
    )
    order.payment_status = PaymentStatus.MOCK_PAID
    order.payments.append(entry)
    return entry


def record_refund(db: Session, order: Order, note: str) -> PaymentLedger:
    if order.payment_status != PaymentStatus.MOCK_PAID:
        raise HTTPException(status_code=409, detail="Order has no captured payment to refund")
    entry = PaymentLedger(
        order_id=order.id,
        entry_type=LedgerEntryType.REFUND,
        amount=Decimal(order.total_amount),
        status=PaymentStatus.REFUNDED,
        method=order.payment_method,
        reference=new_reference("MOCKREF"),
        note=note,
    )
    order.payment_status = PaymentStatus.REFUNDED
    order.payments.append(entry)
    return entry


def allowed_actions(order: Order, viewer: User) -> list[str]:
    actions: list[str] = []
    if viewer.role == C:
        if order.status == OrderStatus.PLACED:
            actions.append("cancel")
        if order.delivered_at is not None and order.review is None:
            actions.append("review")
        if order.status == OrderStatus.DELIVERED and order.return_request is None:
            actions.append("request_return")
    elif viewer.role == O:
        actions += [f"status:{s.value}" for s in next_statuses_for(order, O)
                    if s not in (OrderStatus.ASSIGNED, OrderStatus.REFUNDED)]
        if order.status in (OrderStatus.READY, OrderStatus.ASSIGNED):
            actions.append("assign")
        if order.return_status == ReturnStatus.REQUESTED:
            actions.append("resolve_return")
    elif viewer.role == D:
        actions += [f"status:{s.value}" for s in next_statuses_for(order, D)]
    return actions


def to_summary(order: Order) -> OrderSummaryOut:
    out = OrderSummaryOut.model_validate(order)
    out.item_count = sum(i.quantity for i in order.items)
    out.has_review = order.review is not None
    return out


def to_detail(order: Order, viewer: User) -> OrderOut:
    out = OrderOut.model_validate(order)
    out.item_count = sum(i.quantity for i in order.items)
    out.has_review = order.review is not None
    if order.review:
        out.review = ReviewOut.model_validate(order.review)
        out.review.customer_name = order.customer.name
    out.allowed_actions = allowed_actions(order, viewer)
    return out


def get_order_or_404(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(*ORDER_LOAD_OPTIONS)
        .populate_existing()
        .filter(Order.id == order_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
