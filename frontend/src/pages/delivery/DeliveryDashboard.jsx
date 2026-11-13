import { useEffect, useState } from 'react';
import { deliveryApi } from '../../api/client.js';
import OrderFilters from '../../components/OrderFilters.jsx';
import OrderList from '../../components/OrderList.jsx';
import { Alert, EmptyState, ErrorState, Pagination, Spinner, StatCard } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ACTION_LABEL } from '../../utils/format.js';

const NEXT = { ASSIGNED: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
const SCOPE_STATUSES = {
  active: ['ASSIGNED', 'OUT_FOR_DELIVERY'],
  history: ['DELIVERED', 'REFUNDED'],
};

export default function DeliveryDashboard({ scope }) {
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState({ type: 'success', text: '' });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setFilters({ status: '', date_from: '', date_to: '' });
    setPage(1);
  }, [scope]);

  const stats = useAsync(() => deliveryApi.stats(), [scope]);
  const { data, loading, error, reload } = useAsync(
    () => deliveryApi.orders({ scope, ...filters, page, page_size: 10 }),
    [scope, filters.status, filters.date_from, filters.date_to, page],
    { pollMs: scope === 'active' ? 30000 : undefined },
  );

  const advance = async (order) => {
    const next = NEXT[order.status];
    setBusyId(order.id);
    try {
      await deliveryApi.updateStatus(order.id, next);
      setMessage({ type: 'success', text: `Order #${order.id} marked ${next === 'DELIVERED' ? 'delivered 🎉' : 'out for delivery'}.` });
      reload();
      stats.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{scope === 'active' ? 'My deliveries' : 'Delivery history'}</h1>
          <p className="muted">
            {scope === 'active' ? 'Orders assigned to you that still need delivering.' : 'Orders you have delivered.'}
          </p>
        </div>
      </div>

      {stats.data && (
        <div className="stats-grid">
          <StatCard label="Active" value={stats.data.active} accent="orange" />
          <StatCard label="Delivered today" value={stats.data.delivered_today} accent="green" />
          <StatCard label="Delivered all-time" value={stats.data.delivered_total} />
        </div>
      )}

      <OrderFilters
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        statuses={SCOPE_STATUSES[scope]}
        showDates={scope === 'history'}
      />

      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="🛵" title={scope === 'active' ? 'No deliveries assigned right now' : 'No completed deliveries yet'} />
      ) : (
        <OrderList
          orders={data.items}
          show="rider"
          linkTo={(o) => `/delivery/orders/${o.id}`}
          renderActions={(o) =>
            NEXT[o.status] && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busyId === o.id} onClick={() => advance(o)}>
                {ACTION_LABEL[`status:${NEXT[o.status]}`]}
              </button>
            )
          }
        />
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}
