import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { restaurantApi } from '../api/client.js';
import { EmptyState, ErrorState, Pagination, Spinner, StarRating, VegMark } from '../components/ui.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { cuisineEmoji, formatMoney } from '../utils/format.js';

function useDebounced(value, ms = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function RestaurantCard({ restaurant: r }) {
  return (
    <Link to={`/restaurants/${r.id}`} className={`card restaurant-card ${r.is_open ? '' : 'closed'}`}>
      <div className="restaurant-cover" aria-hidden="true">
        {r.image_url ? <img src={r.image_url} alt="" /> : <span>{cuisineEmoji(r.cuisine)}</span>}
        {!r.is_open && <span className="closed-tag">Closed</span>}
      </div>
      <div className="restaurant-body">
        <h3>{r.name}</h3>
        <p className="muted small">
          {r.cuisine || 'Assorted'} · {r.address || 'On campus'}
        </p>
        <div className="restaurant-meta">
          {r.avg_rating ? (
            <span className="rating">
              <StarRating value={r.avg_rating} size="sm" /> {r.avg_rating} ({r.review_count})
            </span>
          ) : (
            <span className="muted small">No reviews yet</span>
          )}
          <span className="muted small">{r.menu_item_count} dishes</span>
        </div>
      </div>
    </Link>
  );
}

export default function Restaurants() {
  const [mode, setMode] = useState('restaurants');
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [price, setPrice] = useState({ min: '', max: '' });
  const [page, setPage] = useState(1);
  const search = useDebounced(q);
  const minP = useDebounced(price.min);
  const maxP = useDebounced(price.max);

  useEffect(() => setPage(1), [search, cuisine, minP, maxP, mode]);

  const cuisines = useAsync(() => restaurantApi.cuisines(), []);
  const { data, loading, error, reload } = useAsync(
    () =>
      mode === 'restaurants'
        ? restaurantApi.list({ q: search, cuisine, page, page_size: 9 })
        : restaurantApi.searchDishes({ q: search, min_price: minP, max_price: maxP, page, page_size: 12 }),
    [mode, search, cuisine, minP, maxP, page],
  );

  return (
    <section>
      <div className="hero">
        <h1>Hungry? Order from campus favourites.</h1>
        <p className="muted">Browse restaurants or search every dish on campus by name and price.</p>
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'restaurants'} className={mode === 'restaurants' ? 'active' : ''} onClick={() => setMode('restaurants')}>
            Restaurants
          </button>
          <button type="button" role="tab" aria-selected={mode === 'dishes'} className={mode === 'dishes' ? 'active' : ''} onClick={() => setMode('dishes')}>
            Search dishes
          </button>
        </div>
        <input
          className="search"
          type="search"
          placeholder={mode === 'restaurants' ? 'Search restaurants or cuisines…' : 'Search dishes…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search"
        />
        {mode === 'restaurants' ? (
          <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
            <option value="">All cuisines</option>
            {(cuisines.data || []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        ) : (
          <div className="price-range">
            <input type="number" min="0" placeholder="Min ₹" value={price.min} onChange={(e) => setPrice({ ...price, min: e.target.value })} aria-label="Minimum price" />
            <input type="number" min="0" placeholder="Max ₹" value={price.max} onChange={(e) => setPrice({ ...price, max: e.target.value })} aria-label="Maximum price" />
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="🔍" title="Nothing found">
          <p className="muted">Try a different search or filter.</p>
        </EmptyState>
      ) : mode === 'restaurants' ? (
        <div className="grid grid-3">
          {data.items.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </div>
      ) : (
        <div className="grid grid-3">
          {data.items.map((d) => (
            <Link key={d.id} to={`/restaurants/${d.restaurant_id}?q=${encodeURIComponent(d.name)}`} className="card dish-search-card">
              <div className="dish-head">
                <VegMark veg={d.is_veg} />
                <strong>{d.name}</strong>
              </div>
              <p className="muted small">{d.restaurant_name}</p>
              <p className="price">{formatMoney(d.price)}</p>
            </Link>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}
