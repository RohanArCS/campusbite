"""Delivery-partner endpoints. Partners only ever see orders assigned to them."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Order, OrderStatus, User, utcnow
from ..schemas import DeliveryStatsOut, OrderOut, OrderSummaryOut, Page, StatusUpdate
from ..security import require_delivery
from ..services.orders import get_order_or_404, to_detail, to_summary, transition
from ..services.pagination import PageParams, date_range_filter, paginate

router = APIRouter(prefix="/api/delivery", tags=["Delivery Partner"])

ACTIVE = [OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]
HISTORY = [OrderStatus.DELIVERED, OrderStatus.REFUNDED]
PARTNER_SETTABLE = {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED}


def _assigned_order(db: Session, order_id: int, partner: User) -> Order:
    order = get_order_or_404(db, order_id)
    if order.delivery_partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/orders", response_model=Page[OrderSummaryOut])
def my_deliveries(
    scope: Literal["active", "history", "all"] = "active",
    status_filter: OrderStatus | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    pages: PageParams = Depends(),
    partner: User = Depends(require_delivery),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.restaurant), selectinload(Order.customer),
                 selectinload(Order.review))
        .filter(Order.delivery_partner_id == partner.id)
    )
    if status_filter:
        query = query.filter(Order.status == status_filter)
    elif scope == "active":
        query = query.filter(Order.status.in_(ACTIVE))
    elif scope == "history":
        query = query.filter(Order.status.in_(HISTORY))
    query = date_range_filter(query, Order.created_at, date_from, date_to)
    order_col = Order.delivered_at.desc() if scope == "history" else Order.status_updated_at.desc()
    rows, meta = paginate(query.order_by(order_col, Order.id.desc()), pages)
    return {"items": [to_summary(o) for o in rows], **meta}


@router.get("/stats", response_model=DeliveryStatsOut)
def delivery_stats(partner: User = Depends(require_delivery), db: Session = Depends(get_db)):
    base = db.query(func.count(Order.id)).filter(Order.delivery_partner_id == partner.id)
    today_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return DeliveryStatsOut(
        active=base.filter(Order.status.in_(ACTIVE)).scalar(),
        delivered_total=base.filter(Order.delivered_at.isnot(None)).scalar(),
        delivered_today=base.filter(Order.delivered_at >= today_start).scalar(),
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
def delivery_detail(order_id: int, partner: User = Depends(require_delivery), db: Session = Depends(get_db)):
    return to_detail(_assigned_order(db, order_id, partner), partner)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_delivery_status(order_id: int, data: StatusUpdate, partner: User = Depends(require_delivery),
                           db: Session = Depends(get_db)):
    if data.status not in PARTNER_SETTABLE:
        raise HTTPException(status_code=422, detail="Delivery partners may set OUT_FOR_DELIVERY or DELIVERED only")
    order = _assigned_order(db, order_id, partner)
    transition(db, order, data.status, partner, note=data.note)
    db.commit()
    return to_detail(get_order_or_404(db, order.id), partner)
