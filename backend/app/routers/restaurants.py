"""Public browsing endpoints: restaurants, menus, dish search and reviews."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import MenuItem, Restaurant, Review
from ..schemas import DishSearchOut, MenuItemOut, Page, RestaurantOut, ReviewOut
from ..services.pagination import PageParams, paginate

router = APIRouter(prefix="/api", tags=["Restaurants & Menu"])

SortOption = Literal["name", "price_asc", "price_desc"]


def restaurant_out(db: Session, restaurants: list[Restaurant]) -> list[RestaurantOut]:
    ids = [r.id for r in restaurants]
    if not ids:
        return []
    ratings = dict(
        (rid, (avg, cnt))
        for rid, avg, cnt in db.query(Review.restaurant_id, func.avg(Review.rating), func.count(Review.id))
        .filter(Review.restaurant_id.in_(ids))
        .group_by(Review.restaurant_id)
    )
    item_counts = dict(
        db.query(MenuItem.restaurant_id, func.count(MenuItem.id))
        .filter(MenuItem.restaurant_id.in_(ids), MenuItem.is_available.is_(True))
        .group_by(MenuItem.restaurant_id)
        .all()
    )
    result = []
    for r in restaurants:
        out = RestaurantOut.model_validate(r)
        avg, cnt = ratings.get(r.id, (None, 0))
        out.avg_rating = round(float(avg), 1) if avg is not None else None
        out.review_count = cnt
        out.menu_item_count = item_counts.get(r.id, 0)
        result.append(out)
    return result


def apply_dish_filters(query, q, min_price, max_price, category, veg_only, available_only, sort):
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="min_price cannot be greater than max_price")
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(MenuItem.name.ilike(like), MenuItem.description.ilike(like)))
    if min_price is not None:
        query = query.filter(MenuItem.price >= min_price)
    if max_price is not None:
        query = query.filter(MenuItem.price <= max_price)
    if category:
        query = query.filter(MenuItem.category == category)
    if veg_only:
        query = query.filter(MenuItem.is_veg.is_(True))
    if available_only:
        query = query.filter(MenuItem.is_available.is_(True))
    order = {
        "price_asc": (MenuItem.price.asc(), MenuItem.id),
        "price_desc": (MenuItem.price.desc(), MenuItem.id),
    }.get(sort, (MenuItem.category, MenuItem.name))
    return query.order_by(*order)


@router.get("/restaurants", response_model=Page[RestaurantOut])
def list_restaurants(
    q: str | None = Query(None, max_length=100, description="Search by name or cuisine"),
    cuisine: str | None = None,
    open_only: bool = False,
    pages: PageParams = Depends(),
    db: Session = Depends(get_db),
):
    query = db.query(Restaurant)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Restaurant.name.ilike(like), Restaurant.cuisine.ilike(like)))
    if cuisine:
        query = query.filter(Restaurant.cuisine.ilike(cuisine))
    if open_only:
        query = query.filter(Restaurant.is_open.is_(True))
    rows, meta = paginate(query.order_by(Restaurant.name), pages)
    return {"items": restaurant_out(db, rows), **meta}


@router.get("/restaurants/cuisines", response_model=list[str])
def list_cuisines(db: Session = Depends(get_db)):
    rows = db.query(Restaurant.cuisine).filter(Restaurant.cuisine.isnot(None)).distinct().all()
    return sorted(r[0] for r in rows)


@router.get("/restaurants/{restaurant_id}", response_model=RestaurantOut)
def get_restaurant(restaurant_id: int, db: Session = Depends(get_db)):
    r = db.get(Restaurant, restaurant_id)
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant_out(db, [r])[0]


@router.get("/restaurants/{restaurant_id}/menu", response_model=Page[MenuItemOut])
def restaurant_menu(
    restaurant_id: int,
    q: str | None = Query(None, max_length=100, description="Search dish name/description"),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    category: str | None = None,
    veg_only: bool = False,
    available_only: bool = False,
    sort: SortOption = "name",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if not db.get(Restaurant, restaurant_id):
        raise HTTPException(status_code=404, detail="Restaurant not found")
    query = db.query(MenuItem).filter(MenuItem.restaurant_id == restaurant_id)
    query = apply_dish_filters(query, q, min_price, max_price, category, veg_only, available_only, sort)
    rows, meta = paginate(query, PageParams(page, page_size))
    return {"items": rows, **meta}


@router.get("/restaurants/{restaurant_id}/categories", response_model=list[str])
def restaurant_categories(restaurant_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(MenuItem.category)
        .filter(MenuItem.restaurant_id == restaurant_id, MenuItem.category.isnot(None))
        .distinct()
        .all()
    )
    return sorted(r[0] for r in rows)


@router.get("/menu-items/{item_id}", response_model=DishSearchOut)
def get_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(MenuItem).options(joinedload(MenuItem.restaurant)).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Dish not found")
    return DishSearchOut(**MenuItemOut.model_validate(item).model_dump(), restaurant_name=item.restaurant.name)


@router.get("/dishes", response_model=Page[DishSearchOut], summary="Search dishes across all restaurants")
def search_dishes(
    q: str | None = Query(None, max_length=100),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    veg_only: bool = False,
    sort: SortOption = "price_asc",
    pages: PageParams = Depends(),
    db: Session = Depends(get_db),
):
    query = db.query(MenuItem).options(joinedload(MenuItem.restaurant))
    query = apply_dish_filters(query, q, min_price, max_price, None, veg_only, True, sort)
    rows, meta = paginate(query, pages)
    items = [
        DishSearchOut(**MenuItemOut.model_validate(i).model_dump(), restaurant_name=i.restaurant.name)
        for i in rows
    ]
    return {"items": items, **meta}


@router.get("/restaurants/{restaurant_id}/reviews", response_model=Page[ReviewOut])
def restaurant_reviews(restaurant_id: int, pages: PageParams = Depends(), db: Session = Depends(get_db)):
    query = (
        db.query(Review)
        .options(joinedload(Review.customer))
        .filter(Review.restaurant_id == restaurant_id)
        .order_by(Review.created_at.desc())
    )
    rows, meta = paginate(query, pages)
    items = []
    for r in rows:
        out = ReviewOut.model_validate(r)
        out.customer_name = r.customer.name.split(" ")[0]  # first name only for privacy
        items.append(out)
    return {"items": items, **meta}
