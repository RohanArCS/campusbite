"""Restaurant-owner endpoints. Every query is scoped to the owner's own restaurant."""

from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import (
    MenuItem,
    Order,
    OrderStatus,
    PaymentStatus,
    ReminderLog,
    Restaurant,
    ReturnRequest,
    ReturnStatus,
    Review,
    User,
    UserRole,
    utcnow,
)
from ..schemas import (
    AssignPartner,
    AvailabilityUpdate,
    DeliveryPartnerOut,
    MenuItemCreate,
    MenuItemOut,
    MenuItemUpdate,
    Message,
    OrderOut,
    OrderSummaryOut,
    OwnerReturnOut,
    Page,
    ReminderOut,
    RestaurantCreate,
    RestaurantOut,
    RestaurantUpdate,
    ReturnDecision,
    StatsOut,
    StatusUpdate,
)
from ..security import require_owner
from ..services.orders import (
    ACTIVE_STATUSES,
    get_order_or_404,
    record_refund,
    to_detail,
    to_summary,
    transition,
)
from ..services.pagination import PageParams, date_range_filter, paginate
from ..services.reminders import generate_reminders, run_reminder_job
from .restaurants import restaurant_out

router = APIRouter(prefix="/api/owner", tags=["Restaurant Owner"])

OWNER_SETTABLE = {OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.CANCELLED}


def my_restaurant(owner: User = Depends(require_owner), db: Session = Depends(get_db)) -> Restaurant:
    restaurant = db.query(Restaurant).filter(Restaurant.owner_id == owner.id).first()
    if restaurant is None:
        raise HTTPException(status_code=404, detail="You have not set up a restaurant yet")
    return restaurant


def _restaurant_order(db: Session, order_id: int, restaurant: Restaurant) -> Order:
    order = get_order_or_404(db, order_id)
    if order.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _restaurant_item(db: Session, item_id: int, restaurant: Restaurant) -> MenuItem:
    item = db.get(MenuItem, item_id)
    if item is None or item.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Dish not found")
    return item


# ---------- Restaurant profile ----------


@router.get("/restaurant", response_model=RestaurantOut)
def get_my_restaurant(restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    return restaurant_out(db, [restaurant])[0]


@router.post("/restaurant", response_model=RestaurantOut, status_code=status.HTTP_201_CREATED)
def create_my_restaurant(data: RestaurantCreate, owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    if db.query(Restaurant).filter(Restaurant.owner_id == owner.id).first():
        raise HTTPException(status_code=409, detail="You already have a restaurant")
    restaurant = Restaurant(owner_id=owner.id, **data.model_dump())
    db.add(restaurant)
    db.commit()
    return restaurant_out(db, [restaurant])[0]


@router.patch("/restaurant", response_model=RestaurantOut)
def update_my_restaurant(data: RestaurantUpdate, restaurant: Restaurant = Depends(my_restaurant),
                         db: Session = Depends(get_db)):
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(restaurant, key, value)
    db.commit()
    return restaurant_out(db, [restaurant])[0]


# ---------- Menu management ----------


@router.get("/menu", response_model=Page[MenuItemOut])
def list_menu(
    q: str | None = Query(None, max_length=100),
    available: bool | None = None,
    category: str | None = None,
    pages: PageParams = Depends(),
    restaurant: Restaurant = Depends(my_restaurant),
    db: Session = Depends(get_db),
):
    query = db.query(MenuItem).filter(MenuItem.restaurant_id == restaurant.id)
    if q:
        query = query.filter(MenuItem.name.ilike(f"%{q.strip()}%"))
    if available is not None:
        query = query.filter(MenuItem.is_available.is_(available))
    if category:
        query = query.filter(MenuItem.category == category)
    rows, meta = paginate(query.order_by(MenuItem.category, MenuItem.name), pages)
    return {"items": rows, **meta}


@router.post("/menu", response_model=MenuItemOut, status_code=status.HTTP_201_CREATED)
def add_dish(data: MenuItemCreate, restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    item = MenuItem(restaurant_id=restaurant.id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/menu/{item_id}", response_model=MenuItemOut)
def get_dish(item_id: int, restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    return _restaurant_item(db, item_id, restaurant)


@router.patch("/menu/{item_id}", response_model=MenuItemOut)
def update_dish(item_id: int, data: MenuItemUpdate, restaurant: Restaurant = Depends(my_restaurant),
                db: Session = Depends(get_db)):
    item = _restaurant_item(db, item_id, restaurant)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/menu/{item_id}/availability", response_model=MenuItemOut)
def set_availability(item_id: int, data: AvailabilityUpdate, restaurant: Restaurant = Depends(my_restaurant),
                     db: Session = Depends(get_db)):
    item = _restaurant_item(db, item_id, restaurant)
    item.is_available = data.is_available
    db.commit()
    db.refresh(item)
    return item


@router.delete("/menu/{item_id}", response_model=Message)
def delete_dish(item_id: int, restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    item = _restaurant_item(db, item_id, restaurant)
    db.delete(item)  # order_items keep their snapshot; FK is SET NULL
    db.commit()
    return {"detail": "Dish deleted"}


# ---------- Orders ----------


@router.get("/orders", response_model=Page[OrderSummaryOut])
def restaurant_orders(
    status_filter: OrderStatus | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    active_only: bool = False,
    pages: PageParams = Depends(),
    restaurant: Restaurant = Depends(my_restaurant),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.restaurant), selectinload(Order.customer),
                 selectinload(Order.delivery_partner), selectinload(Order.review))
        .filter(Order.restaurant_id == restaurant.id)
    )
    if status_filter:
        query = query.filter(Order.status == status_filter)
    if active_only:
        query = query.filter(Order.status.in_(ACTIVE_STATUSES))
    query = date_range_filter(query, Order.created_at, date_from, date_to)
    rows, meta = paginate(query.order_by(Order.created_at.desc(), Order.id.desc()), pages)
    return {"items": [to_summary(o) for o in rows], **meta}


@router.get("/orders/{order_id}", response_model=OrderOut)
def restaurant_order_detail(order_id: int, owner: User = Depends(require_owner),
                            restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    return to_detail(_restaurant_order(db, order_id, restaurant), owner)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(order_id: int, data: StatusUpdate, owner: User = Depends(require_owner),
                        restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    if data.status not in OWNER_SETTABLE:
        raise HTTPException(
            status_code=422,
            detail="Owners may set ACCEPTED, PREPARING, READY or CANCELLED (reject). "
                   "Use /assign to assign a delivery partner.",
        )
    order = _restaurant_order(db, order_id, restaurant)
    transition(db, order, data.status, owner, note=data.note)
    if data.status == OrderStatus.CANCELLED and order.payment_status == PaymentStatus.MOCK_PAID:
        record_refund(db, order, note="Automatic refund: order rejected by restaurant")
    db.commit()
    return to_detail(get_order_or_404(db, order.id), owner)


@router.get("/delivery-partners", response_model=list[DeliveryPartnerOut])
def delivery_partners(owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    active_counts = dict(
        db.query(Order.delivery_partner_id, func.count(Order.id))
        .filter(Order.status.in_([OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]))
        .group_by(Order.delivery_partner_id)
        .all()
    )
    partners = (
        db.query(User)
        .filter(User.role == UserRole.DELIVERY_PARTNER, User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )
    return [
        DeliveryPartnerOut(id=p.id, name=p.name, phone=p.phone, active_deliveries=active_counts.get(p.id, 0))
        for p in partners
    ]


@router.post("/orders/{order_id}/assign", response_model=OrderOut)
def assign_delivery_partner(order_id: int, data: AssignPartner, owner: User = Depends(require_owner),
                            restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    order = _restaurant_order(db, order_id, restaurant)
    partner = db.get(User, data.delivery_partner_id)
    if partner is None or partner.role != UserRole.DELIVERY_PARTNER or not partner.is_active:
        raise HTTPException(status_code=422, detail="Selected user is not an active delivery partner")

    if order.status == OrderStatus.READY:
        order.delivery_partner_id = partner.id
        transition(db, order, OrderStatus.ASSIGNED, owner, note=f"Assigned to {partner.name}")
    elif order.status == OrderStatus.ASSIGNED:
        # Re-assignment is allowed until the partner picks the order up.
        order.delivery_partner_id = partner.id
    else:
        raise HTTPException(
            status_code=409,
            detail=f"Delivery partners can be assigned only when an order is READY (current: {order.status.value})",
        )
    db.commit()
    return to_detail(get_order_or_404(db, order.id), owner)


# ---------- Returns / refunds ----------


@router.get("/returns", response_model=Page[OwnerReturnOut])
def list_returns(
    status_filter: ReturnStatus | None = Query(None, alias="status"),
    pages: PageParams = Depends(),
    restaurant: Restaurant = Depends(my_restaurant),
    db: Session = Depends(get_db),
):
    query = (
        db.query(ReturnRequest)
        .options(joinedload(ReturnRequest.order), joinedload(ReturnRequest.customer))
        .filter(ReturnRequest.restaurant_id == restaurant.id)
    )
    if status_filter:
        query = query.filter(ReturnRequest.status == status_filter)
    rows, meta = paginate(query.order_by(ReturnRequest.created_at.desc()), pages)
    items = [
        OwnerReturnOut(
            **{k: getattr(r, k) for k in ("id", "order_id", "reason", "status", "resolution_note",
                                         "created_at", "resolved_at")},
            customer_name=r.customer.name,
            order_total=float(r.order.total_amount),
            order_status=r.order.status,
        )
        for r in rows
    ]
    return {"items": items, **meta}


def _pending_return(db: Session, return_id: int, restaurant: Restaurant) -> ReturnRequest:
    rr = db.get(ReturnRequest, return_id)
    if rr is None or rr.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Return request not found")
    if rr.status != ReturnStatus.REQUESTED:
        raise HTTPException(status_code=409, detail=f"This request was already {rr.status.value}")
    return rr


@router.post("/returns/{return_id}/approve", response_model=OrderOut)
def approve_return(return_id: int, data: ReturnDecision, owner: User = Depends(require_owner),
                   restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    rr = _pending_return(db, return_id, restaurant)
    order = get_order_or_404(db, rr.order_id)
    transition(db, order, OrderStatus.REFUNDED, owner, note="Return approved")
    record_refund(db, order, note=f"Refund for approved return #{rr.id}")
    rr.status = ReturnStatus.APPROVED
    rr.resolution_note = data.note
    rr.resolved_by_id = owner.id
    rr.resolved_at = utcnow()
    order.return_status = ReturnStatus.APPROVED
    db.commit()
    return to_detail(get_order_or_404(db, order.id), owner)


@router.post("/returns/{return_id}/reject", response_model=OrderOut)
def reject_return(return_id: int, data: ReturnDecision, owner: User = Depends(require_owner),
                  restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    rr = _pending_return(db, return_id, restaurant)
    order = get_order_or_404(db, rr.order_id)
    rr.status = ReturnStatus.REJECTED
    rr.resolution_note = data.note
    rr.resolved_by_id = owner.id
    rr.resolved_at = utcnow()
    order.return_status = ReturnStatus.REJECTED
    db.commit()
    return to_detail(get_order_or_404(db, order.id), owner)


# ---------- Reminders ----------


@router.get("/reminders", response_model=Page[ReminderOut])
def list_reminders(
    include_resolved: bool = False,
    pages: PageParams = Depends(),
    restaurant: Restaurant = Depends(my_restaurant),
    db: Session = Depends(get_db),
):
    # Refresh synchronously so the dashboard is never stale, even if the scheduler is disabled.
    generate_reminders(db)
    query = db.query(ReminderLog).options(joinedload(ReminderLog.order)).filter(
        ReminderLog.restaurant_id == restaurant.id
    )
    if not include_resolved:
        query = query.filter(ReminderLog.is_resolved.is_(False))
    rows, meta = paginate(query.order_by(ReminderLog.created_at.desc()), pages)
    now = utcnow()
    items = []
    for r in rows:
        out = ReminderOut.model_validate(r)
        out.minutes_pending = int((now - r.order.status_updated_at).total_seconds() // 60)
        items.append(out)
    return {"items": items, **meta}


@router.post("/reminders/check", response_model=Message, status_code=status.HTTP_202_ACCEPTED)
def trigger_reminder_check(background_tasks: BackgroundTasks, _: Restaurant = Depends(my_restaurant)):
    background_tasks.add_task(run_reminder_job)
    return {"detail": "Reminder check scheduled"}


@router.post("/reminders/{reminder_id}/dismiss", response_model=Message)
def dismiss_reminder(reminder_id: int, restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    r = db.get(ReminderLog, reminder_id)
    if r is None or r.restaurant_id != restaurant.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    r.is_resolved = True
    r.resolved_at = utcnow()
    db.commit()
    return {"detail": "Reminder dismissed"}


# ---------- Stats ----------


@router.get("/stats", response_model=StatsOut)
def restaurant_stats(restaurant: Restaurant = Depends(my_restaurant), db: Session = Depends(get_db)):
    orders = (
        db.query(Order).options(selectinload(Order.items)).filter(Order.restaurant_id == restaurant.id).all()
    )
    now = utcnow()
    today = now.date()
    by_status = Counter(o.status.value for o in orders)

    paid = [o for o in orders if o.status != OrderStatus.CANCELLED]
    gross = sum(float(o.total_amount) for o in paid)
    refunded_amount = sum(float(o.total_amount) for o in orders if o.status == OrderStatus.REFUNDED)

    top = Counter()
    for o in paid:
        for i in o.items:
            top[i.name] += i.quantity

    daily = {today - timedelta(days=d): 0.0 for d in range(6, -1, -1)}
    for o in paid:
        d = o.created_at.date()
        if d in daily and o.status != OrderStatus.REFUNDED:
            daily[d] += float(o.total_amount)

    avg_rating, review_count = (
        db.query(func.avg(Review.rating), func.count(Review.id)).filter(Review.restaurant_id == restaurant.id).one()
    )
    menu_total = db.query(func.count(MenuItem.id)).filter(MenuItem.restaurant_id == restaurant.id).scalar()
    menu_available = (
        db.query(func.count(MenuItem.id))
        .filter(MenuItem.restaurant_id == restaurant.id, MenuItem.is_available.is_(True))
        .scalar()
    )
    pending_returns = (
        db.query(func.count(ReturnRequest.id))
        .filter(ReturnRequest.restaurant_id == restaurant.id, ReturnRequest.status == ReturnStatus.REQUESTED)
        .scalar()
    )
    open_reminders = (
        db.query(func.count(ReminderLog.id))
        .filter(ReminderLog.restaurant_id == restaurant.id, ReminderLog.is_resolved.is_(False))
        .scalar()
    )
    net = gross - refunded_amount
    return StatsOut(
        total_orders=len(orders),
        orders_today=sum(1 for o in orders if o.created_at.date() == today),
        active_orders=sum(1 for o in orders if o.status in ACTIVE_STATUSES),
        delivered_orders=by_status.get("DELIVERED", 0),
        cancelled_orders=by_status.get("CANCELLED", 0),
        refunded_orders=by_status.get("REFUNDED", 0),
        gross_revenue=round(gross, 2),
        refunded_amount=round(refunded_amount, 2),
        net_revenue=round(net, 2),
        average_order_value=round(gross / len(paid), 2) if paid else 0.0,
        avg_rating=round(float(avg_rating), 2) if avg_rating is not None else None,
        review_count=review_count,
        menu_items=menu_total,
        available_menu_items=menu_available,
        pending_returns=pending_returns,
        open_reminders=open_reminders,
        orders_by_status={s.value: by_status.get(s.value, 0) for s in OrderStatus},
        top_items=[{"name": n, "quantity": q} for n, q in top.most_common(5)],
        revenue_last_7_days=[{"date": d.isoformat(), "revenue": round(v, 2)} for d, v in daily.items()],
    )
