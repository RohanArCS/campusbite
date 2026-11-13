from datetime import datetime, timezone
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator

from .models import (
    LedgerEntryType,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    ReturnStatus,
    UserRole,
)


def _as_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


# Timestamps are stored as naive UTC; serialize them with an explicit offset so browsers
# convert them to local time correctly.
UTCDatetime = Annotated[datetime, PlainSerializer(_as_utc_iso, return_type=str)]

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class Message(BaseModel):
    detail: str


# ---------- Auth / users ----------


class UserBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)


class RestaurantSignup(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    cuisine: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    description: str | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)
    role: UserRole = UserRole.CUSTOMER
    restaurant: RestaurantSignup | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    phone: str | None
    address: str | None
    created_at: UTCDatetime


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserBrief(ORMModel):
    id: int
    name: str
    phone: str | None = None


# ---------- Restaurants & menu ----------


class RestaurantBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    cuisine: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)
    is_open: bool = True


class RestaurantCreate(RestaurantBase):
    pass


class RestaurantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = None
    cuisine: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=500)
    is_open: bool | None = None


class RestaurantOut(ORMModel):
    id: int
    name: str
    description: str | None
    cuisine: str | None
    address: str | None
    image_url: str | None
    is_open: bool
    avg_rating: float | None = None
    review_count: int = 0
    menu_item_count: int = 0


class MenuItemBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    price: float = Field(ge=0, le=100000)
    category: str | None = Field(default=None, max_length=80)
    is_veg: bool = False
    is_available: bool = True
    image_url: str | None = Field(default=None, max_length=500)


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = None
    price: float | None = Field(default=None, ge=0, le=100000)
    category: str | None = Field(default=None, max_length=80)
    is_veg: bool | None = None
    is_available: bool | None = None
    image_url: str | None = Field(default=None, max_length=500)


class AvailabilityUpdate(BaseModel):
    is_available: bool


class MenuItemOut(ORMModel):
    id: int
    restaurant_id: int
    name: str
    description: str | None
    price: float
    category: str | None
    is_veg: bool
    is_available: bool
    image_url: str | None


class DishSearchOut(MenuItemOut):
    restaurant_name: str


class ReviewOut(ORMModel):
    id: int
    order_id: int
    rating: int
    comment: str | None
    created_at: UTCDatetime
    customer_name: str | None = None


# ---------- Orders ----------


class CartItemIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(ge=1, le=50)


class OrderCreate(BaseModel):
    restaurant_id: int
    items: list[CartItemIn] = Field(min_length=1, max_length=50)
    delivery_address: str = Field(min_length=5, max_length=500)
    contact_phone: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=500)
    payment_method: PaymentMethod = PaymentMethod.CARD

    @field_validator("items")
    @classmethod
    def unique_items(cls, items: list[CartItemIn]) -> list[CartItemIn]:
        ids = [i.menu_item_id for i in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each menu item may appear only once; use quantity instead")
        return items


class OrderItemOut(ORMModel):
    id: int
    menu_item_id: int | None
    name: str
    unit_price: float
    quantity: int
    line_total: float


class PaymentOut(ORMModel):
    id: int
    entry_type: LedgerEntryType
    amount: float
    status: PaymentStatus
    method: PaymentMethod
    reference: str
    note: str | None
    created_at: UTCDatetime


class StatusHistoryOut(ORMModel):
    id: int
    from_status: OrderStatus | None
    to_status: OrderStatus
    note: str | None
    created_at: UTCDatetime


class ReturnRequestOut(ORMModel):
    id: int
    order_id: int
    reason: str
    status: ReturnStatus
    resolution_note: str | None
    created_at: UTCDatetime
    resolved_at: UTCDatetime | None


class RestaurantBrief(ORMModel):
    id: int
    name: str
    address: str | None = None


class OrderSummaryOut(ORMModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    return_status: ReturnStatus | None
    total_amount: float
    item_count: int = 0
    created_at: UTCDatetime
    status_updated_at: UTCDatetime
    restaurant: RestaurantBrief
    customer: UserBrief | None = None
    delivery_partner: UserBrief | None = None
    has_review: bool = False


class OrderOut(OrderSummaryOut):
    payment_method: PaymentMethod
    subtotal: float
    delivery_fee: float
    delivery_address: str
    contact_phone: str | None
    notes: str | None
    delivered_at: UTCDatetime | None
    items: list[OrderItemOut]
    payments: list[PaymentOut]
    history: list[StatusHistoryOut]
    review: ReviewOut | None = None
    return_request: ReturnRequestOut | None = None
    allowed_actions: list[str] = []


class StatusUpdate(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=500)


class AssignPartner(BaseModel):
    delivery_partner_id: int


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ReturnCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Please describe the reason in at least 10 characters")
        return v


class ReturnDecision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class OwnerReturnOut(ReturnRequestOut):
    customer_name: str
    order_total: float
    order_status: OrderStatus


class DeliveryPartnerOut(ORMModel):
    id: int
    name: str
    phone: str | None
    active_deliveries: int = 0


class ReminderOut(ORMModel):
    id: int
    order_id: int
    order_status: OrderStatus
    message: str
    is_resolved: bool
    created_at: UTCDatetime
    minutes_pending: int = 0


class StatsOut(BaseModel):
    total_orders: int
    orders_today: int
    active_orders: int
    delivered_orders: int
    cancelled_orders: int
    refunded_orders: int
    gross_revenue: float
    refunded_amount: float
    net_revenue: float
    average_order_value: float
    avg_rating: float | None
    review_count: int
    menu_items: int
    available_menu_items: int
    pending_returns: int
    open_reminders: int
    orders_by_status: dict[str, int]
    top_items: list[dict]
    revenue_last_7_days: list[dict]


class DeliveryStatsOut(BaseModel):
    active: int
    delivered_total: int
    delivered_today: int


# ---------- AI ----------


class InsightRequest(BaseModel):
    question: str = Field(default="Summarize my recent orders.", min_length=3, max_length=500)


class InsightResponse(BaseModel):
    answer: str
    source: str  # "openai" or "fallback"
    model: str | None = None
    orders_considered: int
    generated_at: UTCDatetime
