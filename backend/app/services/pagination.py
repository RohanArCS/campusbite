import math
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, Query
from sqlalchemy.orm import Query as SAQuery


class PageParams:
    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    ):
        self.page = page
        self.page_size = page_size


def paginate(query: SAQuery, params: PageParams) -> tuple[list, dict]:
    total = query.order_by(None).count()
    rows = query.offset((params.page - 1) * params.page_size).limit(params.page_size).all()
    meta = {
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": max(1, math.ceil(total / params.page_size)) if total else 1,
    }
    return rows, meta


def date_range_filter(query: SAQuery, column, date_from: date | None, date_to: date | None):
    """Filter by an inclusive calendar-date range (UTC)."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    if date_from:
        query = query.filter(column >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(column < datetime.combine(date_to + timedelta(days=1), time.min))
    return query
