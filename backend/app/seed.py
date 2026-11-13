"""Demo data for local development.

Run with:  python -m app.seed            (or set SEED_DEMO_DATA=true to seed on startup)
All demo accounts use the password:  password123
"""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from .database import SessionLocal, init_db
from .models import (
    MenuItem,
    Order,
    OrderItem,
    OrderStatus,
    OrderStatusHistory,
    PaymentMethod,
    Restaurant,
    Review,
    User,
    UserRole,
    utcnow,
)
from .security import hash_password
from .services.orders import record_mock_payment, record_refund

DEMO_PASSWORD = "password123"

RESTAURANTS = [
    {
        "owner": ("Priya Sharma", "owner.spice@campusbite.dev"),
        "name": "Spice Route",
        "cuisine": "North Indian",
        "address": "Food Court, Block A",
        "description": "Home-style curries, tandoor breads and biryanis.",
        "menu": [
            ("Paneer Butter Masala", "Cottage cheese in a rich tomato-butter gravy", 220, "Mains", True),
            ("Chicken Biryani", "Fragrant basmati rice layered with spiced chicken", 260, "Mains", False),
            ("Dal Makhani", "Slow-cooked black lentils with cream", 180, "Mains", True),
            ("Butter Naan", "Soft tandoor bread brushed with butter", 45, "Breads", True),
            ("Garlic Naan", "Tandoor bread with garlic and coriander", 55, "Breads", True),
            ("Veg Samosa (2 pcs)", "Crispy pastry stuffed with spiced potatoes", 60, "Starters", True),
            ("Chicken Tikka", "Char-grilled marinated chicken pieces", 240, "Starters", False),
            ("Mango Lassi", "Chilled yoghurt and mango smoothie", 90, "Drinks", True),
        ],
    },
    {
        "owner": ("Marco Rossi", "owner.pizza@campusbite.dev"),
        "name": "Slice Society",
        "cuisine": "Italian",
        "address": "Student Center, Ground Floor",
        "description": "Wood-fired pizzas and fresh pasta.",
        "menu": [
            ("Margherita Pizza", "Tomato, mozzarella and basil", 249, "Pizza", True),
            ("Pepperoni Pizza", "Loaded with spicy pepperoni", 329, "Pizza", False),
            ("Farmhouse Pizza", "Capsicum, onion, mushroom and corn", 299, "Pizza", True),
            ("Penne Arrabbiata", "Penne in a spicy tomato sauce", 229, "Pasta", True),
            ("Chicken Alfredo", "Fettuccine in a creamy parmesan sauce", 279, "Pasta", False),
            ("Garlic Bread", "Toasted with herb butter", 99, "Sides", True),
            ("Tiramisu", "Classic coffee-flavoured dessert", 149, "Desserts", True),
        ],
    },
    {
        "owner": ("Aisha Khan", "owner.green@campusbite.dev"),
        "name": "Green Bowl",
        "cuisine": "Healthy",
        "address": "Library Lane Kiosk",
        "description": "Salads, smoothie bowls and wraps.",
        "menu": [
            ("Quinoa Power Bowl", "Quinoa, chickpeas, avocado and greens", 239, "Bowls", True),
            ("Grilled Chicken Salad", "Lean chicken, lettuce, cherry tomatoes", 259, "Salads", False),
            ("Falafel Wrap", "Falafel, hummus and pickled veggies", 179, "Wraps", True),
            ("Berry Smoothie Bowl", "Mixed berries, banana, granola", 199, "Bowls", True),
            ("Cold-Pressed Juice", "Seasonal fruits, no added sugar", 120, "Drinks", True),
        ],
    },
]

CUSTOMERS = [
    ("Alice Johnson", "alice@campusbite.dev", "Hostel 4, Room 212", "9876500001"),
    ("Bob Mehta", "bob@campusbite.dev", "Hostel 2, Room 105", "9876500002"),
]
PARTNERS = [
    ("Ravi Kumar", "rider.ravi@campusbite.dev", "9876511111"),
    ("Maya Singh", "rider.maya@campusbite.dev", "9876522222"),
]


def _user(db: Session, name, email, role, phone=None, address=None) -> User:
    user = User(name=name, email=email, hashed_password=hash_password(DEMO_PASSWORD), role=role,
                phone=phone, address=address)
    db.add(user)
    db.flush()
    return user


def _order(db: Session, customer: User, restaurant: Restaurant, lines, final_status: OrderStatus,
           hours_ago: float, partner: User | None = None) -> Order:
    created = utcnow() - timedelta(hours=hours_ago)
    subtotal = sum(Decimal(item.price) * qty for item, qty in lines)
    order = Order(customer_id=customer.id, restaurant_id=restaurant.id, status=OrderStatus.PLACED,
                  payment_method=PaymentMethod.UPI, delivery_address=customer.address,
                  contact_phone=customer.phone, subtotal=subtotal, delivery_fee=Decimal("30"),
                  total_amount=subtotal + Decimal("30"), created_at=created, status_updated_at=created)
    for item, qty in lines:
        order.items.append(OrderItem(menu_item_id=item.id, name=item.name, unit_price=item.price,
                                     quantity=qty, line_total=Decimal(item.price) * qty))
    db.add(order)
    db.flush()
    record_mock_payment(db, order)

    path = [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY,
            OrderStatus.ASSIGNED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]
    if final_status == OrderStatus.CANCELLED:
        steps = [OrderStatus.PLACED, OrderStatus.CANCELLED]
    else:
        steps = path[: path.index(final_status) + 1]
    # Space the steps evenly between creation and "now" (at most 8 minutes apart) so no
    # timestamp lands in the future for recent orders.
    now = utcnow()
    gap = min(timedelta(minutes=8), (now - created) / max(1, len(steps)))
    t = created
    prev = None
    for s in steps:
        db.add(OrderStatusHistory(order_id=order.id, from_status=prev, to_status=s, created_at=t))
        prev = s
        last = t
        t += gap
    order.status = final_status
    order.status_updated_at = last
    if final_status in path and path.index(final_status) >= path.index(OrderStatus.ASSIGNED) and partner:
        order.delivery_partner_id = partner.id
    if final_status == OrderStatus.DELIVERED:
        order.delivered_at = order.status_updated_at
    if final_status == OrderStatus.CANCELLED:
        record_refund(db, order, note="Automatic refund for cancelled order")
    return order


def seed(db: Session) -> bool:
    if db.query(User).first():
        return False

    restaurants: list[Restaurant] = []
    for spec in RESTAURANTS:
        owner = _user(db, *spec["owner"], UserRole.RESTAURANT_OWNER, phone="9800000000")
        r = Restaurant(owner_id=owner.id, name=spec["name"], cuisine=spec["cuisine"],
                       address=spec["address"], description=spec["description"])
        for name, desc, price, cat, veg in spec["menu"]:
            r.menu_items.append(MenuItem(name=name, description=desc, price=Decimal(price),
                                         category=cat, is_veg=veg))
        db.add(r)
        restaurants.append(r)
    db.flush()

    alice, bob = (_user(db, n, e, UserRole.CUSTOMER, phone=p, address=a) for n, e, a, p in CUSTOMERS)
    ravi, maya = (_user(db, n, e, UserRole.DELIVERY_PARTNER, phone=p) for n, e, p in PARTNERS)

    spice, pizza, green = restaurants
    sm, pm, gm = spice.menu_items, pizza.menu_items, green.menu_items

    delivered = [
        _order(db, alice, spice, [(sm[0], 1), (sm[3], 2)], OrderStatus.DELIVERED, 24 * 9, ravi),
        _order(db, alice, pizza, [(pm[0], 1), (pm[5], 1)], OrderStatus.DELIVERED, 24 * 5, maya),
        _order(db, alice, spice, [(sm[1], 1), (sm[7], 1)], OrderStatus.DELIVERED, 24 * 2, ravi),
        _order(db, alice, green, [(gm[0], 1), (gm[4], 1)], OrderStatus.DELIVERED, 20, maya),
        _order(db, bob, pizza, [(pm[1], 2)], OrderStatus.DELIVERED, 24 * 3, ravi),
    ]
    _order(db, alice, pizza, [(pm[3], 1)], OrderStatus.CANCELLED, 24 * 4)
    _order(db, alice, spice, [(sm[0], 1), (sm[4], 2)], OrderStatus.OUT_FOR_DELIVERY, 0.6, ravi)
    _order(db, bob, spice, [(sm[2], 1), (sm[3], 3)], OrderStatus.READY, 0.5)
    _order(db, bob, spice, [(sm[5], 2)], OrderStatus.PLACED, 0.5)   # stale -> reminder
    _order(db, alice, pizza, [(pm[2], 1)], OrderStatus.ACCEPTED, 0.4)  # stale -> reminder
    _order(db, bob, green, [(gm[2], 2)], OrderStatus.PLACED, 0.05)  # fresh

    for order, rating, comment in [
        (delivered[0], 5, "Paneer was amazing, naan still warm!"),
        (delivered[1], 4, "Good pizza, slightly late."),
        (delivered[4], 5, "Best pepperoni on campus."),
    ]:
        db.add(Review(order_id=order.id, customer_id=order.customer_id,
                      restaurant_id=order.restaurant_id, rating=rating, comment=comment))
    db.commit()
    return True


if __name__ == "__main__":
    init_db()
    session = SessionLocal()
    try:
        print("Seeded demo data." if seed(session) else "Database already has users; skipping seed.")
    finally:
        session.close()
