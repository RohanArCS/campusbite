import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { restaurantApi } from '../api/client.js';
import { Alert, EmptyState, ErrorState, Pagination, Spinner, StarRating, VegMark } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { cuisineEmoji, formatDate, formatMoney } from '../utils/format.js';

function QuantityControl({ value, onChange }) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(value - 1)} aria-label="Decrease quantity">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

export function MenuItemCard({ dish, canOrder, quantity, onAdd, onChangeQty }) {
  return (
    <div className={`card dish-card ${dish.is_available ? '' : 'unavailable'}`}>
      <div className="dish-info">
        <div className="dish-head">
          <VegMark veg={dish.is_veg} />
          <strong>{dish.name}</strong>
        </div>
        {dish.description && <p className="muted small">{dish.description}</p>}
        <p className="price">{formatMoney(dish.price)}</p>
      </div>
      <div className="dish-action">
        {!dish.is_available ? (
          <span className="badge badge-cancelled">Unavailable</span>
        ) : quantity > 0 ? (
          <QuantityControl value={quantity} onChange={onChangeQty} />
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAdd} disabled={!canOrder}>
            Add
          </button>
        )}
      </div>
    </div>
  );
}

function Reviews({ restaurantId }) {
  const [page, setPage] = useState(1);
  const { data, loading } = useAsync(() => restaurantApi.reviews(restaurantId, { page, page_size: 5 }), [restaurantId, page]);
  if (loading && !data) return <Spinner label="Loading reviews…" />;
  if (!data?.items.length) return <p className="muted">No reviews yet.</p>;
  return (
    <>
      <ul className="reviews">
        {data.items.map((r) => (
          <li key={r.id} className="card">
            <div className="review-head">
              <StarRating value={r.rating} size="sm" />
              <strong>{r.customer_name}</strong>
              <span className="muted small">{formatDate(r.created_at)}</span>
            </div>
            {r.comment && <p>{r.comment}</p>}
          </li>
        ))}
      </ul>
      <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
    </>
  );
}

export default function RestaurantMenu() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const cart = useCart();
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '',
    category: '',
    min_price: '',
    max_price: '',
    veg_only: false,
    available_only: false,
    sort: 'name',
  });
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);
  useEffect(() => setPage(1), [debouncedQ, filters.category, filters.min_price, filters.max_price, filters.veg_only, filters.available_only, filters.sort]);

  const restaurant = useAsync(() => restaurantApi.get(id), [id]);
  const categories = useAsync(() => restaurantApi.categories(id), [id]);
  const menu = useAsync(
    () =>
      restaurantApi.menu(id, {
        ...filters,
        q: debouncedQ,
        veg_only: filters.veg_only || undefined,
        available_only: filters.available_only || undefined,
        page,
        page_size: 24,
      }),
    [id, debouncedQ, filters.category, filters.min_price, filters.max_price, filters.veg_only, filters.available_only, filters.sort, page],
  );

  const grouped = useMemo(() => {
    if (!menu.data) return [];
    if (filters.sort !== 'name') return [['', menu.data.items]];
    const map = new Map();
    menu.data.items.forEach((d) => {
      const key = d.category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    return [...map.entries()];
  }, [menu.data, filters.sort]);

  if (restaurant.loading) return <Spinner />;
  if (restaurant.error) return <ErrorState error={restaurant.error} onRetry={restaurant.reload} />;
  const r = restaurant.data;

  const isCustomer = user?.role === 'customer';
  const canOrder = r.is_open && (!user || isCustomer);

  const handleAdd = (dish) => {
    if (!user) {
      navigate('/login', { state: { from: `/restaurants/${id}` } });
      return;
    }
    if (cart.restaurant && cart.restaurant.id !== r.id) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Your cart has items from ${cart.restaurant.name}. Start a new cart from ${r.name}?`)) return;
    }
    cart.addItem(r, dish);
    setNotice(`${dish.name} added to cart`);
  };

  const setF = (key) => (e) =>
    setFilters({ ...filters, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <section>
      <div className="card restaurant-header">
        <div className="restaurant-cover big" aria-hidden="true">
          <span>{cuisineEmoji(r.cuisine)}</span>
        </div>
        <div>
          <h1>{r.name}</h1>
          <p className="muted">
            {r.cuisine} · {r.address}
          </p>
          {r.description && <p>{r.description}</p>}
          <div className="restaurant-meta">
            {r.avg_rating ? (
              <span className="rating">
                <StarRating value={r.avg_rating} size="sm" /> {r.avg_rating} · {r.review_count} reviews
              </span>
            ) : (
              <span className="muted small">No reviews yet</span>
            )}
            {!r.is_open && <span className="badge badge-cancelled">Currently closed</span>}
          </div>
        </div>
      </div>

      {user && !isCustomer && (
        <Alert type="info">You are logged in as a {user.role.replace('_', ' ')}. Only customers can place orders.</Alert>
      )}
      <Alert type="success" onClose={() => setNotice('')}>
        {notice && (
          <>
            {notice} · <Link to="/cart">View cart ({cart.count})</Link>
          </>
        )}
      </Alert>

      <div className="filters">
        <label className="grow">
          <span>Search dishes</span>
          <input type="search" value={filters.q} onChange={setF('q')} placeholder="e.g. naan, pizza…" />
        </label>
        <label>
          <span>Category</span>
          <select value={filters.category} onChange={setF('category')}>
            <option value="">All</option>
            {(categories.data || []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Min ₹</span>
          <input type="number" min="0" value={filters.min_price} onChange={setF('min_price')} />
        </label>
        <label>
          <span>Max ₹</span>
          <input type="number" min="0" value={filters.max_price} onChange={setF('max_price')} />
        </label>
        <label>
          <span>Sort</span>
          <select value={filters.sort} onChange={setF('sort')}>
            <option value="name">By category</option>
            <option value="price_asc">Price: low → high</option>
            <option value="price_desc">Price: high → low</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.veg_only} onChange={setF('veg_only')} /> Veg only
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.available_only} onChange={setF('available_only')} /> Available now
        </label>
      </div>

      {menu.error ? (
        <ErrorState error={menu.error} onRetry={menu.reload} />
      ) : menu.loading && !menu.data ? (
        <Spinner label="Loading menu…" />
      ) : menu.data.items.length === 0 ? (
        <EmptyState icon="🥄" title="No dishes match your filters" />
      ) : (
        grouped.map(([category, dishes]) => (
          <div key={category || 'all'} className="menu-section">
            {category && <h2>{category}</h2>}
            <div className="grid grid-2">
              {dishes.map((d) => (
                <MenuItemCard
                  key={d.id}
                  dish={d}
                  canOrder={canOrder}
                  quantity={cart.restaurant?.id === r.id ? cart.quantityOf(d.id) : 0}
                  onAdd={() => handleAdd(d)}
                  onChangeQty={(q) => cart.updateQuantity(d.id, q)}
                />
              ))}
            </div>
          </div>
        ))
      )}
      {menu.data && <Pagination page={menu.data.page} pages={menu.data.pages} total={menu.data.total} onChange={setPage} />}

      {cart.count > 0 && cart.restaurant?.id === r.id && (
        <Link to="/cart" className="floating-cart">
          🛒 {cart.count} item{cart.count > 1 ? 's' : ''} · {formatMoney(cart.subtotal)} → Checkout
        </Link>
      )}

      <h2>Reviews</h2>
      <Reviews restaurantId={id} />
    </section>
  );
}
