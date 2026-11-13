"""Customer order endpoints: checkout (dummy payment), history, tracking, cancel, review, return."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import (
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    PaymentStatus,
    Restaurant,
    ReturnRequest,
    ReturnStatus,
    Review,
    User,
)
from ..schemas import (
    OrderCreate,
    OrderOut,
    OrderSummaryOut,
    Page,
    ReturnCreate,
    ReviewCreate,
)
from ..security import require_customer
from ..services.orders import (
    ACTIVE_STATUSES,
    get_order_or_404,
    record_mock_payment,
    record_refund,
    to_detail,
    to_summary,
    transition,
)
from ..services.pagination import PageParams, date_range_filter, paginate

router = APIRouter(prefix="/api/orders", tags=["Customer Orders"])

DELIVERY_FEE = Decimal("30.00")


def _own_order(db: Session, order_id: int, customer: User) -> Order:
    order = get_order_or_404(db, order_id)
    if order.customer_id != customer.id:
        # 404 rather than 403 so we don't reveal that the order exists.
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def place_order(data: OrderCreate, customer: User = Depends(require_customer), db: Session = Depends(get_db)):
    restaurant = db.get(Restaurant, data.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if not restaurant.is_open:
        raise HTTPException(status_code=409, detail="This restaurant is currently closed")

    ids = [i.menu_item_id for i in data.items]
    menu = {m.id: m for m in db.query(MenuItem).filter(MenuItem.id.in_(ids)).all()}

    order = Order(
        customer_id=customer.id,
        restaurant_id=restaurant.id,
        status=OrderStatus.PLACED,
        payment_status=PaymentStatus.PENDING,
        payment_method=data.payment_method,
        delivery_address=data.delivery_address.strip(),
        contact_phone=data.contact_phone or customer.phone,
        notes=data.notes,
        subtotal=Decimal("0"),
        delivery_fee=DELIVERY_FEE,
        total_amount=Decimal("0"),
    )
    subtotal = Decimal("0")
    for line in data.items:
        item = menu.get(line.menu_item_id)
        if item is None or item.restaurant_id != restaurant.id:
            raise HTTPException(status_code=422, detail=f"Dish {line.menu_item_id} is not on this restaurant's menu")
        if not item.is_available:
            raise HTTPException(status_code=409, detail=f"'{item.name}' is currently unavailable")
        line_total = Decimal(item.price) * line.quantity
        subtotal += line_total
        order.items.append(
            OrderItem(menu_item_id=item.id, name=item.name, unit_price=item.price,
                      quantity=line.quantity, line_total=line_total)
        )
    order.subtotal = subtotal
    order.total_amount = subtotal + DELIVERY_FEE

    db.add(order)
    db.flush()
    order.history.append(OrderStatusHistory(order_id=order.id, from_status=None, to_status=OrderStatus.PLACED,
                              changed_by_id=customer.id, note="Order placed"))
    record_mock_payment(db, order)  # dummy payment -> payment_status = mock_paid
    db.commit()
    return to_detail(get_order_or_404(db, order.id), customer)


@router.get("", response_model=Page[OrderSummaryOut])
def my_orders(
    status_filter: OrderStatus | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    active_only: bool = False,
    pages: PageParams = Depends(),
    customer: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.restaurant),
                 selectinload(Order.review), selectinload(Order.delivery_partner))
        .filter(Order.customer_id == customer.id)
    )
    if status_filter:
        query = query.filter(Order.status == status_filter)
    if active_only:
        query = query.filter(Order.status.in_(ACTIVE_STATUSES))
    query = date_range_filter(query, Order.created_at, date_from, date_to)
    rows, meta = paginate(query.order_by(Order.created_at.desc(), Order.id.desc()), pages)
    return {"items": [to_summary(o) for o in rows], **meta}


@router.get("/{order_id}", response_model=OrderOut)
def order_detail(order_id: int, customer: User = Depends(require_customer), db: Session = Depends(get_db)):
    return to_detail(_own_order(db, order_id, customer), customer)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: int, customer: User = Depends(require_customer), db: Session = Depends(get_db)):
    order = _own_order(db, order_id, customer)
    if order.status != OrderStatus.PLACED:
        raise HTTPException(
            status_code=409,
            detail=f"Orders can only be cancelled while PLACED (current status: {order.status.value})",
        )
    transition(db, order, OrderStatus.CANCELLED, customer, note="Cancelled by customer")
    if order.payment_status == PaymentStatus.MOCK_PAID:
        record_refund(db, order, note="Automatic refund for cancelled order")
    db.commit()
    return to_detail(get_order_or_404(db, order.id), customer)


@router.post("/{order_id}/review", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def review_order(order_id: int, data: ReviewCreate, customer: User = Depends(require_customer),
                 db: Session = Depends(get_db)):
    order = _own_order(db, order_id, customer)
    if order.delivered_at is None:
        raise HTTPException(status_code=409, detail="You can review an order only after it is delivered")
    if order.review is not None:
        raise HTTPException(status_code=409, detail="You have already reviewed this order")
    db.add(Review(order_id=order.id, customer_id=customer.id, restaurant_id=order.restaurant_id,
                  rating=data.rating, comment=(data.comment or "").strip() or None))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="You have already reviewed this order") from None
    return to_detail(get_order_or_404(db, order.id), customer)


@router.post("/{order_id}/return", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def request_return(order_id: int, data: ReturnCreate, customer: User = Depends(require_customer),
                   db: Session = Depends(get_db)):
    order = _own_order(db, order_id, customer)
    if order.return_request is not None:
        raise HTTPException(status_code=409, detail="A return request already exists for this order")
    if order.status != OrderStatus.DELIVERED:
        raise HTTPException(status_code=409, detail="Returns can be requested only for delivered orders")
    db.add(ReturnRequest(order_id=order.id, customer_id=customer.id,
                         restaurant_id=order.restaurant_id, reason=data.reason))
    order.return_status = ReturnStatus.REQUESTED
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A return request already exists for this order") from None
    return to_detail(get_order_or_404(db, order.id), customer)

