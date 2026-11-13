import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ownerApi } from '../../api/client.js';
import OrderList from '../../components/OrderList.jsx';
import { Alert, EmptyState, ErrorState, Spinner, StatCard, StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatMoney, STATUS_LABEL } from '../../utils/format.js';

function RestaurantSetup({ onCreated }) {
  const [form, setForm] = useState({ name: '', cuisine: '', address: '', description: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await ownerApi.createRestaurant(form);
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="card auth-card wide" onSubmit={submit}>
      <h1>Set up your restaurant</h1>
      <Alert>{error}</Alert>
      <label className="field">
        <span>Name</span>
        <input value={form.name} onChange={set('name')} required minLength={2} />
      </label>
      <label className="field">
        <span>Cuisine</span>
        <input value={form.cuisine} onChange={set('cuisine')} />
      </label>
      <label className="field">
        <span>Address</span>
        <input value={form.address} onChange={set('address')} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={2} value={form.description} onChange={set('description')} />
      </label>
      <button className="btn btn-primary">Create restaurant</button>
    </form>
  );
}

function RevenueChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.revenue));
  return (
    <div className="bar-chart" role="img" aria-label="Revenue for the last 7 days">
      {days.map((d) => (
        <div key={d.date} className="bar-col" title={`${d.date}: ${formatMoney(d.revenue)}`}>
          <span className="bar-value small">{d.revenue ? `₹${Math.round(d.revenue)}` : ''}</span>
          <div className="bar" style={{ height: `${(d.revenue / max) * 100}%` }} />
          <span className="bar-label small muted">
            {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OwnerDashboard() {
  const restaurant = useAsync(() => ownerApi.restaurant(), []);
  const stats = useAsync(() => ownerApi.stats(), [restaurant.data?.id], { pollMs: 60000 });
  const reminders = useAsync(() => ownerApi.reminders({ page_size: 10 }), [restaurant.data?.id], { pollMs: 60000 });
  const recent = useAsync(() => ownerApi.orders({ active_only: true, page_size: 5 }), [restaurant.data?.id], {
    pollMs: 30000,
  });
  const [toggling, setToggling] = useState(false);

  if (restaurant.loading) return <Spinner />;
  if (restaurant.error?.status === 404) return <RestaurantSetup onCreated={restaurant.reload} />;
  if (restaurant.error) return <ErrorState error={restaurant.error} onRetry={restaurant.reload} />;

  const r = restaurant.data;
  const s = stats.data;

  const toggleOpen = async () => {
    setToggling(true);
    try {
      restaurant.setData(await ownerApi.updateRestaurant({ is_open: !r.is_open }));
    } finally {
      setToggling(false);
    }
  };

  const dismiss = async (id) => {
    await ownerApi.dismissReminder(id);
    reminders.reload();
    stats.reload();
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{r.name}</h1>
          <p className="muted">
            {r.cuisine} · {r.address}
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className={`btn ${r.is_open ? 'btn-outline' : 'btn-primary'}`} onClick={toggleOpen} disabled={toggling}>
            {r.is_open ? '🟢 Open — click to close' : '🔴 Closed — click to open'}
          </button>
        </div>
      </div>

      {reminders.data?.items.length > 0 && (
        <div className="card reminders">
          <h3>⏰ Reminders ({reminders.data.total})</h3>
          <ul>
            {reminders.data.items.map((rem) => (
              <li key={rem.id}>
                <div>
                  <StatusBadge status={rem.order_status} /> {rem.message}
                  <span className="muted small"> · waiting {rem.minutes_pending} min</span>
                </div>
                <div className="row-actions">
                  <Link className="btn btn-primary btn-sm" to={`/owner/orders/${rem.order_id}`}>
                    Open order
                  </Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(rem.id)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.loading && !s ? (
        <Spinner label="Loading statistics…" />
      ) : stats.error ? (
        <ErrorState error={stats.error} onRetry={stats.reload} />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Orders today" value={s.orders_today} accent="orange" />
            <StatCard label="Active orders" value={s.active_orders} />
            <StatCard label="Net revenue" value={formatMoney(s.net_revenue)} hint={`${formatMoney(s.refunded_amount)} refunded`} accent="green" />
            <StatCard label="Avg order value" value={formatMoney(s.average_order_value)} />
            <StatCard label="Rating" value={s.avg_rating ? `${s.avg_rating} ★` : '—'} hint={`${s.review_count} reviews`} />
            <StatCard label="Menu" value={`${s.available_menu_items}/${s.menu_items}`} hint="dishes available" />
            <StatCard label="Pending returns" value={s.pending_returns} accent={s.pending_returns ? 'red' : undefined} />
            <StatCard label="Total orders" value={s.total_orders} hint={`${s.delivered_orders} delivered · ${s.cancelled_orders} cancelled`} />
          </div>

          <div className="two-col">
            <div className="card">
              <h3>Revenue · last 7 days</h3>
              <RevenueChart days={s.revenue_last_7_days} />
            </div>
            <div className="card">
              <h3>Top dishes</h3>
              {s.top_items.length ? (
                <ol className="top-items">
                  {s.top_items.map((t) => (
                    <li key={t.name}>
                      <span>{t.name}</span>
                      <strong>{t.quantity} sold</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No sales yet.</p>
              )}
              <h3>Orders by status</h3>
              <div className="badges wrap">
                {Object.entries(s.orders_by_status)
                  .filter(([, n]) => n > 0)
                  .map(([status, n]) => (
                    <span key={status} className={`badge badge-${status.toLowerCase()}`}>
                      {STATUS_LABEL[status]}: {n}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Active orders</h2>
        <Link to="/owner/orders">View all orders →</Link>
      </div>
      {recent.loading && !recent.data ? (
        <Spinner />
      ) : recent.error ? (
        <ErrorState error={recent.error} onRetry={recent.reload} />
      ) : recent.data.items.length === 0 ? (
        <EmptyState icon="😌" title="No active orders right now" />
      ) : (
        <OrderList orders={recent.data.items} linkTo={(o) => `/owner/orders/${o.id}`} show="customer" />
      )}
      {recent.data?.total > 5 && <p className="muted small">Showing 5 of {recent.data.total} active orders</p>}
    </section>
  );
}
