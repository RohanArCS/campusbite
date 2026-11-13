# 🍔 CampusBite – Restaurant Ordering & Delivery Platform

CampusBite is a full-stack food ordering and delivery app for a university campus. **Customers** browse restaurants, order with a dummy payment, track and review orders, request refunds, and ask an AI assistant about their order history. **Restaurant owners** manage menus, orders, riders, refunds and reminders. **Delivery partners** see and update only the deliveries assigned to them.

| Layer | Tech |
| --- | --- |
| Frontend | React 18 (Vite), JavaScript ES6+, React Hooks (`useState`, `useEffect`, `useContext`, `useMemo`, `useRef`, custom `useAsync`), React Router DOM 6, Fetch API |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 ORM, JWT (PyJWT), bcrypt |
| Database | PostgreSQL 16 (Docker) · SQLite supported for quick local dev/tests |
| AI | OpenAI Chat Completions API (`gpt-4o-mini` by default, configurable) |
| DevOps | Docker, Docker Compose, Git/GitHub |

---

## Project structure

```
campusbite/
├── docker-compose.yml        # PostgreSQL + FastAPI backend
├── .env.example              # env vars for docker-compose (copy to .env)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example          # env vars for running without Docker
│   ├── app/
│   │   ├── main.py           # app factory, lifespan (DB init, seeding, reminder scheduler), CORS
│   │   ├── config.py         # pydantic-settings, all config from env vars
│   │   ├── database.py       # engine, session, Base
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # bcrypt, JWT, get_current_user, require_roles (RBAC)
│   │   ├── middleware.py     # request logging + response-time middleware
│   │   ├── seed.py           # demo data
│   │   ├── routers/          # auth, restaurants, orders (customer), owner, delivery, ai
│   │   └── services/         # order state machine, payments, reminders, AI, pagination
│   └── tests/                # pytest end-to-end API tests
└── frontend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── api/client.js       # fetch wrapper + endpoint helpers (JWT from localStorage)
        ├── context/            # AuthContext, CartContext
        ├── hooks/useAsync.js   # loading / error / reload / polling
        ├── components/         # Navbar, ProtectedRoute, OrderList, OrderFilters, OrderDetails, ui.jsx …
        └── pages/              # Login, Register, Restaurants, RestaurantMenu, customer/, owner/, delivery/
```

---

## Features

### Customer
- Register / log in (JWT stored in `localStorage`, sent as `Authorization: Bearer …`)
- Browse restaurants (search by name/cuisine, cuisine filter, ratings, pagination)
- View menus; **search & filter dishes** by name, category, min/max price, veg-only, availability; sort by price
- Global dish search across all restaurants
- Cart (one restaurant at a time, kept in React context + `localStorage`): add, change quantity, remove, clear
- Checkout with **dummy payment** (card / UPI / wallet) → order `PLACED`, payment `mock_paid`, ledger entry recorded
- Dashboard: current & past orders, **filter by status and date**, pagination, payment & return status
- Order tracking page with a progress tracker, status history and auto-refresh
- Cancel order (only while `PLACED`; dummy payment automatically refunded)
- Rate & review after delivery (one review per order)
- Return / refund request after delivery with a mandatory reason (one request per order)
- **AI order insights** chat with suggested questions

### Restaurant owner
- Dashboard with statistics: orders today, active orders, gross/net revenue, refunds, average order value, rating, menu availability, 7-day revenue chart, top dishes, orders by status
- Open/close the restaurant
- **Menu management**: add, edit, delete dishes; toggle available/unavailable; search & filter
- **Order management**: filter by status and date, quick actions (Accept → Start preparing → Mark ready), reject orders
- Assign (and re-assign, before pickup) delivery partners when an order is `READY`
- Approve / reject return requests (approve → order `REFUNDED`, payment `refunded`, refund ledger entry)
- **Reminders** for orders stuck in `PLACED`/`ACCEPTED` for more than 15 minutes

### Delivery partner
- Sees **only orders assigned to them**
- Customer delivery details (name, phone, address, notes) and pickup restaurant
- `ASSIGNED → OUT_FOR_DELIVERY → DELIVERED`
- Active deliveries with status filter, delivery history with date filter, personal stats

---

## Business rules (enforced in the backend)

Order lifecycle (`backend/app/services/orders.py` → `TRANSITIONS`):

```
PLACED ──(owner)──▶ ACCEPTED ──(owner)──▶ PREPARING ──(owner)──▶ READY ──(owner assigns)──▶ ASSIGNED
   │                                                                                          │
   └─(customer/owner)─▶ CANCELLED                                                   (rider)   ▼
                                                     DELIVERED ◀──(rider)── OUT_FOR_DELIVERY
                                                         │
                                                         └─(owner approves return)─▶ REFUNDED
```

- Any transition not in the table returns **409 Conflict**; a role that isn't allowed to make a move gets **403**.
- Customers can cancel only `PLACED` orders; delivered orders can never be cancelled.
- Riders can only update orders where `delivery_partner_id == their id` (others get 404).
- Owners can only touch their own restaurant's menu, orders, returns and reminders.
- Ordering validates that every dish belongs to the restaurant, is available, and that the restaurant is open; prices are taken from the database, never from the client.
- One review per delivered order and one return request per order (enforced with `UNIQUE` constraints as well as checks).
- Requests for resources you don't own return **404** to avoid leaking their existence.

---

## Running locally

### Prerequisites
- Docker Desktop (for the backend + PostgreSQL)
- Node.js 18+ and npm (for the frontend)

### 1. Backend with Docker Compose

```bash
cd campusbite
cp .env.example .env
```

Edit `.env` and at minimum set:
- `POSTGRES_PASSWORD` – any strong password
- `JWT_SECRET_KEY` – e.g. output of `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- `OPENAI_API_KEY` – optional; without it the AI page returns a basic, non-AI summary

```bash
docker compose up --build
```

- API: http://localhost:8000
- Interactive API docs (Swagger UI): http://localhost:8000/docs · ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/api/health

Stop with `docker compose down` (add `-v` to also delete the database volume).

### 2. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Open http://localhost:5173. Production build: `npm run build` (output in `frontend/dist`).

### Running the backend without Docker (optional)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env       # uses SQLite by default
uvicorn app.main:app --reload
```

### Tests

```bash
cd backend
pytest -q
```

Tests use a throwaway SQLite database by default. To run them against PostgreSQL instead (for example the Compose `db` container), point `TEST_DATABASE_URL` at an **empty** database:

```bash
docker compose exec db createdb -U campusbite campusbite_test
TEST_DATABASE_URL=postgresql+psycopg://campusbite:<POSTGRES_PASSWORD>@localhost:5432/campusbite_test pytest -q
```

The suite covers registration and login, RBAC, the full order lifecycle including invalid transitions, cross-user data isolation, payments and refunds, reviews, returns, filters and pagination, reminders, menu management and AI rate limiting.

---

## Demo accounts

With `SEED_DEMO_DATA=true`, the first startup seeds three restaurants, menus and order history. **Password for every demo account: `password123`.**

| Role | Email |
| --- | --- |
| Customer | `alice@campusbite.dev`, `bob@campusbite.dev` |
| Restaurant owner | `owner.spice@campusbite.dev` (Spice Route), `owner.pizza@campusbite.dev` (Slice Society), `owner.green@campusbite.dev` (Green Bowl) |
| Delivery partner | `rider.ravi@campusbite.dev`, `rider.maya@campusbite.dev` |

The seed includes orders stuck in `PLACED`/`ACCEPTED` for 25–30 minutes, so reminders appear on the Spice Route and Slice Society dashboards right away. The login page has one-click buttons that fill in demo credentials.

---

## Environment variables

Root `.env` (used by `docker-compose.yml`). Never commit it; `.env.example` lists the names only.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `POSTGRES_DB` | | `campusbite` | Database name |
| `POSTGRES_USER` | | `campusbite` | Database user |
| `POSTGRES_PASSWORD` | ✅ | – | Database password (compose refuses to start without it) |
| `POSTGRES_PORT` | | `5432` | Host port for PostgreSQL |
| `BACKEND_PORT` | | `8000` | Host port for the API |
| `DATABASE_URL` | | built by compose | SQLAlchemy URL. Compose sets it to `postgresql+psycopg://…@db:5432/…`; when running without Docker it defaults to SQLite |
| `JWT_SECRET_KEY` | ✅ | insecure dev value | Secret used to sign JWTs |
| `JWT_ALGORITHM` | | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | | `1440` | Token lifetime |
| `CORS_ORIGINS` | | `http://localhost:5173,…` | Comma-separated allowed frontend origins |
| `OPENAI_API_KEY` | | – | OpenAI key (backend only). Blank means a basic fallback summary |
| `OPENAI_MODEL` | | `gpt-4o-mini` | Model used for insights |
| `OPENAI_BASE_URL` | | – | Optional OpenAI-compatible endpoint. Leave blank for OpenAI; for Google Gemini use `https://generativelanguage.googleapis.com/v1beta/openai/` with a Gemini key and model (e.g. `gemini-flash-latest`) |
| `AI_RATE_LIMIT_PER_MINUTE` | | `5` | Per-customer AI request limit |
| `AI_MAX_OUTPUT_TOKENS` | | `2000` | Max tokens per AI answer (kept high because thinking models such as Gemini use part of it for reasoning) |
| `AI_MAX_ORDERS` | | `50` | Max recent orders sent as AI context |
| `REMINDER_THRESHOLD_MINUTES` | | `15` | Minutes before a PLACED/ACCEPTED order triggers a reminder |
| `REMINDER_CHECK_INTERVAL_SECONDS` | | `60` | Background job interval |
| `ENABLE_REMINDER_SCHEDULER` | | `true` | Toggle the periodic reminder job |
| `SEED_DEMO_DATA` | | `false` | Seed demo data on first start (only if the DB has no users) |
| `LOG_LEVEL` | | `INFO` | Logging level |

Frontend `frontend/.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL |

---

## Database

Tables are created automatically on startup with SQLAlchemy (`Base.metadata.create_all`). PostgreSQL data is stored in the `pgdata` Docker volume. To reset it: `docker compose down -v && docker compose up --build`. To seed manually: `docker compose exec backend python -m app.seed`.

| Table | Purpose / key relationships |
| --- | --- |
| `users` | All accounts; `role` ∈ customer, restaurant_owner, delivery_partner; bcrypt `hashed_password` |
| `restaurants` | `owner_id → users.id` (one restaurant per owner) |
| `menu_items` | `restaurant_id → restaurants.id`; price, category, veg, availability |
| `orders` | `customer_id → users`, `restaurant_id → restaurants`, `delivery_partner_id → users` (nullable); status, payment_status, return_status, totals, address |
| `order_items` | `order_id → orders`, `menu_item_id → menu_items` (SET NULL); name/price **snapshot** at order time |
| `order_status_history` | Audit trail of every status change (who/when/note) |
| `reviews` | `order_id` **unique**, so each delivered order gets at most one review |
| `payment_ledger` | Many entries per order: `payment` (mock_paid) and `refund` (refunded) records with unique references |
| `return_requests` | `order_id` **unique**, so each order gets at most one return request; reason, status, resolution |
| `reminder_logs` | Admin reminder logs from the background job; unique per (order, status) |

Relationships: a customer has many orders; a restaurant has many menu items and orders; an order has many order items, many ledger entries, one optional review and one optional return request; a delivery partner can be assigned many orders.

---

## API documentation

Full interactive docs are generated by FastAPI at **`/docs`** (Swagger UI) and **`/redoc`**. Click **Authorize** in Swagger and log in with a demo email/password; this uses the OAuth2 password flow at `/api/auth/token`.

All list endpoints are paginated with `?page=1&page_size=10` and return `{ items, total, page, page_size, pages }`. Errors return `{ "detail": "message" }`.

| Method & path | Role | Description |
| --- | --- | --- |
| **Auth** | | |
| `POST /api/auth/register` | public | Register (customer / restaurant_owner with `restaurant` / delivery_partner); returns JWT |
| `POST /api/auth/login` | public | JSON login; returns JWT and user |
| `POST /api/auth/token` | public | OAuth2 form login (Swagger) |
| `GET/PATCH /api/auth/me` | any | Current user profile |
| **Browsing** | | |
| `GET /api/restaurants` | public | List: `q`, `cuisine`, `open_only` |
| `GET /api/restaurants/cuisines` | public | Distinct cuisines |
| `GET /api/restaurants/{id}` | public | Restaurant details with rating |
| `GET /api/restaurants/{id}/menu` | public | Menu: `q`, `min_price`, `max_price`, `category`, `veg_only`, `available_only`, `sort` |
| `GET /api/restaurants/{id}/categories` | public | Menu categories |
| `GET /api/restaurants/{id}/reviews` | public | Reviews |
| `GET /api/dishes` | public | Search dishes across restaurants (name & price filters) |
| `GET /api/menu-items/{id}` | public | Dish details |
| **Customer orders** | | |
| `POST /api/orders` | customer | Place order + dummy payment |
| `GET /api/orders` | customer | Own orders: `status`, `date_from`, `date_to`, `active_only` |
| `GET /api/orders/{id}` | customer | Order details, tracking, payments, `allowed_actions` |
| `POST /api/orders/{id}/cancel` | customer | Cancel (PLACED only) and auto-refund |
| `POST /api/orders/{id}/review` | customer | `{rating 1-5, comment}` after delivery |
| `POST /api/orders/{id}/return` | customer | `{reason}` after delivery, once |
| **Restaurant owner** | | |
| `GET/POST/PATCH /api/owner/restaurant` | owner | Own restaurant profile (open/close) |
| `GET/POST /api/owner/menu` | owner | List / add dishes |
| `GET/PATCH/DELETE /api/owner/menu/{id}` | owner | Get / update / delete dish |
| `PATCH /api/owner/menu/{id}/availability` | owner | `{is_available}` |
| `GET /api/owner/orders` | owner | Orders: `status`, `date_from`, `date_to`, `active_only` |
| `GET /api/owner/orders/{id}` | owner | Order details |
| `PATCH /api/owner/orders/{id}/status` | owner | `{status: ACCEPTED, PREPARING, READY or CANCELLED}` |
| `GET /api/owner/delivery-partners` | owner | Partners with active-delivery counts |
| `POST /api/owner/orders/{id}/assign` | owner | `{delivery_partner_id}` (READY → ASSIGNED, or reassign) |
| `GET /api/owner/returns` | owner | Return requests: `status` |
| `POST /api/owner/returns/{id}/approve` | owner | Approve and refund |
| `POST /api/owner/returns/{id}/reject` | owner | Reject |
| `GET /api/owner/stats` | owner | Restaurant statistics |
| `GET /api/owner/reminders` | owner | Open reminders (`include_resolved`) |
| `POST /api/owner/reminders/check` | owner | Queue a reminder scan as a FastAPI `BackgroundTask` |
| `POST /api/owner/reminders/{id}/dismiss` | owner | Dismiss reminder |
| **Delivery partner** | | |
| `GET /api/delivery/orders` | rider | Assigned orders: `scope=active,history,all`, `status`, dates |
| `GET /api/delivery/orders/{id}` | rider | Delivery details (customer info) |
| `PATCH /api/delivery/orders/{id}/status` | rider | `{status: OUT_FOR_DELIVERY or DELIVERED}` |
| `GET /api/delivery/stats` | rider | Active / delivered counts |
| **AI** | | |
| `POST /api/ai/insights` | customer | `{question}` → `{answer, source, model, orders_considered}` |
| **Misc** | | |
| `GET /api/health` | public | Health check |

---

## How the key requirements are implemented

**Authentication & RBAC.** Passwords are hashed with bcrypt. Logging in returns a signed JWT (`sub` = user id, `role`, `exp`). Every protected route depends on `get_current_user`, and role-restricted routes use `require_roles(...)`. Ownership checks (own orders, own restaurant, assigned deliveries) happen in each router. On the frontend, `ProtectedRoute` redirects by role, and the API client logs the user out automatically on a 401.

**Dummy payment & refunds.** Placing an order writes a `payment_ledger` row (`payment`, `mock_paid`, reference `MOCKPAY-…`) and sets `orders.payment_status = mock_paid`. An approved return, a customer cancellation or an owner rejection writes a `refund` row (`MOCKREF-…`) and sets `payment_status = refunded`. A rejected return sets `return_status = rejected`.

**AI insights.** `POST /api/ai/insights` loads only orders where `customer_id == current_user.id` (the most recent `AI_MAX_ORDERS`). It builds compact JSON context: orders, items and precomputed stats such as weekly spend, undelivered orders and most-ordered items. That context goes to OpenAI with a system prompt that restricts answers to the provided data. Since the context never contains other customers' data, the model can't reveal it whatever the question asks. The key lives only in backend env vars. Error handling:
- a per-user in-memory rate limit returns **429** with a `Retry-After` header
- OpenAI `RateLimitError` returns 429
- auth or config errors return 503
- timeouts return 504
- other API errors return 502
- the SDK retries transient failures twice

**Middleware.** `RequestLoggingMiddleware` logs `METHOD /path -> status in X ms` and the request id for every request. It adds `X-Process-Time-Ms` and `X-Request-ID` response headers, warns on slow requests (>1 s) and converts unhandled exceptions into JSON 500s. A custom validation handler turns Pydantic errors into readable messages.

**Background tasks.** An asyncio loop started in the FastAPI lifespan runs `generate_reminders` every `REMINDER_CHECK_INTERVAL_SECONDS`. It finds orders in `PLACED`/`ACCEPTED` whose `status_updated_at` is older than `REMINDER_THRESHOLD_MINUTES` (15) and inserts `reminder_logs` rows, at most one per order and status. Reminders resolve automatically when the order moves on. Owners can also queue a scan through FastAPI `BackgroundTasks` (`POST /api/owner/reminders/check`). The dashboard shows the reminders, and real-time push isn't needed.

**Security hygiene.** Secrets come only from environment variables. `.env` is git-ignored and `.dockerignore` keeps it out of the image. The container runs as a non-root user.

---

## Notes and possible improvements
- Use Alembic migrations instead of `create_all` for schema evolution.
- Move the AI rate limiter to Redis when running multiple backend replicas.
- Date filters use UTC calendar days.
