import { useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../../api/client.js';
import OrderFilters from '../../components/OrderFilters.jsx';
import OrderList from '../../components/OrderList.jsx';
import { Alert, EmptyState, ErrorState, Pagination, Spinner, StatCard } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState({ type: 'success', text: '' });

  const active = useAsync(() => orderApi.list({ active_only: true, page_size: 1 }), [], { pollMs: 30000 });
  const delivered = useAsync(() => orderApi.list({ status: 'DELIVERED', page_size: 1 }), []);
  const { data, loading, error, reload } = useAsync(
    () => orderApi.list({ ...filters, page, page_size: 8 }),
    [filters.status, filters.date_from, filters.date_to, page],
  );

  const changeFilters = (f) => {
    setFilters(f);
    setPage(1);
  };

  const cancel = async (order) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Cancel order #${order.id}? Your dummy payment will be refunded.`)) return;
    try {
      await orderApi.cancel(order.id);
      setMessage({ type: 'success', text: `Order #${order.id} cancelled and refunded.` });
      reload();
      active.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Hi {user.name.split(' ')[0]} 👋</h1>
          <p className="muted">Track current orders, review past ones, and request returns.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/insights" className="btn btn-outline">
            ✨ AI insights
          </Link>
          <Link to="/restaurants" className="btn btn-primary">
            Order food
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Active orders" value={active.data?.total ?? '—'} accent="orange" />
        <StatCard label="Delivered orders" value={delivered.data?.total ?? '—'} accent="green" />
        <StatCard label="All orders" value={data?.total ?? '—'} hint={filters.status || filters.date_from ? 'matching filters' : ''} />
      </div>

      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      <OrderFilters filters={filters} onChange={changeFilters} />

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="🧾" title="No orders found">
          <p className="muted">{filters.status || filters.date_from || filters.date_to ? 'Try clearing your filters.' : 'Your orders will show up here.'}</p>
        </EmptyState>
      ) : (
        <OrderList
          orders={data.items}
          linkTo={(o) => `/orders/${o.id}`}
          renderActions={(o) => (
            <>
              {o.status === 'PLACED' && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => cancel(o)}>
                  Cancel
                </button>
              )}
              {o.status === 'DELIVERED' && !o.has_review && (
                <Link className="btn btn-outline btn-sm" to={`/orders/${o.id}#review`}>
                  Rate order
                </Link>
              )}
              {o.status === 'DELIVERED' && !o.return_status && (
                <Link className="btn btn-ghost btn-sm" to={`/orders/${o.id}#return`}>
                  Request return
                </Link>
              )}
              <Link className="btn btn-ghost btn-sm" to={`/orders/${o.id}`}>
                Track →
              </Link>
            </>
          )}
        />
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}
