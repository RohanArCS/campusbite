def _spice(client):
    r = client.get("/api/restaurants", params={"q": "spice"})
    return r.json()["items"][0]


def _place(client, headers, qty=1):
    rest = _spice(client)
    menu = client.get(f"/api/restaurants/{rest['id']}/menu").json()["items"]
    r = client.post(
        "/api/orders",
        headers=headers,
        json={"restaurant_id": rest["id"], "items": [{"menu_item_id": menu[0]["id"], "quantity": qty}],
              "delivery_address": "Hostel 4, Room 212", "payment_method": "upi"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_health_and_middleware_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert "X-Process-Time-Ms" in r.headers and "X-Request-ID" in r.headers


def test_register_login_and_duplicate(client):
    body = {"name": "New User", "email": "new@campusbite.dev", "password": "supersecret"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201 and r.json()["user"]["role"] == "customer"
    assert client.post("/api/auth/register", json=body).status_code == 409
    assert client.post("/api/auth/login", json={"email": body["email"], "password": "wrong-pass"}).status_code == 401
    owner = {"name": "Owner", "email": "o2@campusbite.dev", "password": "supersecret", "role": "restaurant_owner"}
    assert client.post("/api/auth/register", json=owner).status_code == 422


def test_protected_requires_token(client):
    assert client.get("/api/orders").status_code == 401
    assert client.get("/api/orders", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_role_enforcement(client, alice, ravi, spice_owner):
    assert client.get("/api/owner/orders", headers=alice).status_code == 403
    assert client.get("/api/delivery/orders", headers=spice_owner).status_code == 403
    assert client.get("/api/orders", headers=ravi).status_code == 403
    assert client.post("/api/ai/insights", headers=spice_owner, json={"question": "hi there"}).status_code == 403


def test_menu_search_and_filters(client):
    rest = _spice(client)
    items = client.get(f"/api/restaurants/{rest['id']}/menu", params={"q": "naan"}).json()["items"]
    assert items and all("naan" in i["name"].lower() for i in items)
    cheap = client.get(f"/api/restaurants/{rest['id']}/menu", params={"max_price": 60, "sort": "price_desc"}).json()["items"]
    assert cheap and all(i["price"] <= 60 for i in cheap)
    assert [i["price"] for i in cheap] == sorted([i["price"] for i in cheap], reverse=True)
    assert client.get("/api/dishes", params={"q": "pizza"}).json()["total"] >= 2
    assert client.get(f"/api/restaurants/{rest['id']}/menu", params={"min_price": 100, "max_price": 10}).status_code == 422


def test_full_lifecycle_payment_review_return(client, alice, bob, spice_owner, pizza_owner, ravi, maya):
    order = _place(client, alice, qty=2)
    oid = order["id"]
    assert order["status"] == "PLACED" and order["payment_status"] == "mock_paid"
    assert order["payments"][0]["entry_type"] == "payment"
    assert order["total_amount"] == order["subtotal"] + 30

    # other users cannot see it
    assert client.get(f"/api/orders/{oid}", headers=bob).status_code == 404
    assert client.get(f"/api/owner/orders/{oid}", headers=pizza_owner).status_code == 404

    # invalid transition rejected
    r = client.patch(f"/api/owner/orders/{oid}/status", headers=spice_owner, json={"status": "READY"})
    assert r.status_code == 409
    # cannot assign before READY
    partners = client.get("/api/owner/delivery-partners", headers=spice_owner).json()
    ravi_id = next(p["id"] for p in partners if p["name"].startswith("Ravi"))
    assert client.post(f"/api/owner/orders/{oid}/assign", headers=spice_owner,
                       json={"delivery_partner_id": ravi_id}).status_code == 409

    for s in ("ACCEPTED", "PREPARING", "READY"):
        r = client.patch(f"/api/owner/orders/{oid}/status", headers=spice_owner, json={"status": s})
        assert r.status_code == 200 and r.json()["status"] == s

    # customer can't cancel anymore
    assert client.post(f"/api/orders/{oid}/cancel", headers=alice).status_code == 409

    r = client.post(f"/api/owner/orders/{oid}/assign", headers=spice_owner, json={"delivery_partner_id": ravi_id})
    assert r.status_code == 200 and r.json()["status"] == "ASSIGNED"

    # maya isn't assigned
    assert client.patch(f"/api/delivery/orders/{oid}/status", headers=maya,
                        json={"status": "OUT_FOR_DELIVERY"}).status_code == 404
    # skip step rejected
    assert client.patch(f"/api/delivery/orders/{oid}/status", headers=ravi,
                        json={"status": "DELIVERED"}).status_code == 409
    # owner can't set delivery statuses
    assert client.patch(f"/api/owner/orders/{oid}/status", headers=spice_owner,
                        json={"status": "DELIVERED"}).status_code == 422

    detail = client.get(f"/api/delivery/orders/{oid}", headers=ravi).json()
    assert detail["delivery_address"] and detail["customer"]["name"] == "Alice Johnson"

    for s in ("OUT_FOR_DELIVERY", "DELIVERED"):
        r = client.patch(f"/api/delivery/orders/{oid}/status", headers=ravi, json={"status": s})
        assert r.status_code == 200 and r.json()["status"] == s

    assert client.post(f"/api/orders/{oid}/cancel", headers=alice).status_code == 409

    # review once
    assert client.post(f"/api/orders/{oid}/review", headers=alice, json={"rating": 5, "comment": "yum"}).status_code == 201
    assert client.post(f"/api/orders/{oid}/review", headers=alice, json={"rating": 4}).status_code == 409

    # return once, needs reason
    assert client.post(f"/api/orders/{oid}/return", headers=alice, json={"reason": "bad"}).status_code == 422
    r = client.post(f"/api/orders/{oid}/return", headers=alice, json={"reason": "Food arrived cold and soggy"})
    assert r.status_code == 201 and r.json()["return_status"] == "requested"
    assert client.post(f"/api/orders/{oid}/return", headers=alice,
                       json={"reason": "Trying a second time here"}).status_code == 409

    returns = client.get("/api/owner/returns", headers=spice_owner, params={"status": "requested"}).json()["items"]
    rid = next(x["id"] for x in returns if x["order_id"] == oid)
    assert client.post(f"/api/owner/returns/{rid}/approve", headers=pizza_owner, json={}).status_code == 404
    r = client.post(f"/api/owner/returns/{rid}/approve", headers=spice_owner, json={"note": "Sorry!"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "REFUNDED" and body["payment_status"] == "refunded" and body["return_status"] == "approved"
    assert [p["entry_type"] for p in body["payments"]] == ["payment", "refund"]
    assert client.post(f"/api/owner/returns/{rid}/approve", headers=spice_owner, json={}).status_code == 409


def test_return_rejection(client, alice, spice_owner, ravi):
    order = _place(client, alice)
    oid = order["id"]
    for s in ("ACCEPTED", "PREPARING", "READY"):
        client.patch(f"/api/owner/orders/{oid}/status", headers=spice_owner, json={"status": s})
    partners = client.get("/api/owner/delivery-partners", headers=spice_owner).json()
    client.post(f"/api/owner/orders/{oid}/assign", headers=spice_owner, json={"delivery_partner_id": partners[1]["id"]})
    for s in ("OUT_FOR_DELIVERY", "DELIVERED"):
        assert client.patch(f"/api/delivery/orders/{oid}/status", headers=ravi, json={"status": s}).status_code == 200
    client.post(f"/api/orders/{oid}/return", headers=alice, json={"reason": "Missing one item from order"})
    rid = next(x["id"] for x in client.get("/api/owner/returns", headers=spice_owner).json()["items"] if x["order_id"] == oid)
    r = client.post(f"/api/owner/returns/{rid}/reject", headers=spice_owner, json={"note": "All items were packed"})
    assert r.json()["return_status"] == "rejected" and r.json()["payment_status"] == "mock_paid"
    assert r.json()["status"] == "DELIVERED"


def test_cancel_placed_order_refunds(client, alice):
    order = _place(client, alice)
    r = client.post(f"/api/orders/{order['id']}/cancel", headers=alice)
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELLED" and r.json()["payment_status"] == "refunded"
    assert client.post(f"/api/orders/{order['id']}/return", headers=alice,
                       json={"reason": "Cancelled order return attempt"}).status_code == 409


def test_filters_and_pagination(client, alice, spice_owner):
    r = client.get("/api/orders", headers=alice, params={"page_size": 2})
    data = r.json()
    assert len(data["items"]) == 2 and data["total"] > 2 and data["pages"] >= 2
    delivered = client.get("/api/orders", headers=alice, params={"status": "DELIVERED"}).json()["items"]
    assert delivered and all(o["status"] == "DELIVERED" for o in delivered)
    assert client.get("/api/owner/orders", headers=spice_owner,
                      params={"date_from": "2030-01-01"}).json()["total"] == 0
    assert client.get("/api/orders", headers=alice,
                      params={"date_from": "2030-01-02", "date_to": "2030-01-01"}).status_code == 422


def test_reminders_and_stats(client, spice_owner):
    reminders = client.get("/api/owner/reminders", headers=spice_owner).json()
    assert reminders["total"] >= 1
    assert all(r["order_status"] in ("PLACED", "ACCEPTED") for r in reminders["items"])
    rid = reminders["items"][0]["id"]
    assert client.post(f"/api/owner/reminders/{rid}/dismiss", headers=spice_owner).status_code == 200
    assert client.post("/api/owner/reminders/check", headers=spice_owner).status_code == 202

    stats = client.get("/api/owner/stats", headers=spice_owner).json()
    assert stats["total_orders"] > 0 and len(stats["revenue_last_7_days"]) == 7
    assert stats["net_revenue"] <= stats["gross_revenue"]


def test_owner_menu_management(client, spice_owner, pizza_owner):
    r = client.post("/api/owner/menu", headers=spice_owner,
                    json={"name": "Masala Chai", "price": 30, "category": "Drinks", "is_veg": True})
    assert r.status_code == 201
    iid = r.json()["id"]
    assert client.patch(f"/api/owner/menu/{iid}", headers=pizza_owner, json={"price": 1}).status_code == 404
    r = client.patch(f"/api/owner/menu/{iid}/availability", headers=spice_owner, json={"is_available": False})
    assert r.json()["is_available"] is False
    assert client.patch(f"/api/owner/menu/{iid}", headers=spice_owner, json={"price": -5}).status_code == 422
    assert client.delete(f"/api/owner/menu/{iid}", headers=spice_owner).status_code == 200


def test_unavailable_dish_cannot_be_ordered(client, alice, spice_owner):
    rest = _spice(client)
    item = client.post("/api/owner/menu", headers=spice_owner,
                       json={"name": "Seasonal Special", "price": 99, "is_available": False}).json()
    r = client.post("/api/orders", headers=alice, json={
        "restaurant_id": rest["id"], "items": [{"menu_item_id": item["id"], "quantity": 1}],
        "delivery_address": "Hostel 4, Room 212"})
    assert r.status_code == 409


def test_ai_insights_fallback_scoped_and_rate_limited(client, bob):
    r = client.post("/api/ai/insights", headers=bob, json={"question": "Summarize my last five orders"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "fallback"
    # Bob's context must not contain Alice's orders
    assert "Green Bowl" in body["answer"] or "Slice Society" in body["answer"] or "Spice Route" in body["answer"]
    from app.models import Order, User
    from app.database import SessionLocal
    from app.services.ai import build_context, load_customer_orders
    db = SessionLocal()
    try:
        bob_user = db.query(User).filter_by(email="bob@campusbite.dev").one()
        ctx = build_context(load_customer_orders(db, bob_user))
        bob_ids = {o.id for o in db.query(Order).filter_by(customer_id=bob_user.id)}
        assert {o["order_id"] for o in ctx["orders"]} == bob_ids
    finally:
        db.close()
    client.post("/api/ai/insights", headers=bob, json={"question": "again please"})
    client.post("/api/ai/insights", headers=bob, json={"question": "again please"})
    r = client.post("/api/ai/insights", headers=bob, json={"question": "again please"})
    assert r.status_code == 429 and "Retry-After" in r.headers
