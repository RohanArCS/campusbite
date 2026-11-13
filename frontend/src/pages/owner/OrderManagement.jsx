import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ownerApi } from '../../api/client.js';
import OrderFilters from '../../components/OrderFilters.jsx';
import OrderList from '../../components/OrderList.jsx';
import { Alert, EmptyState, ErrorState, Pagination, Spinner } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const QUICK = [
  { label: 'All', status: '' },
  { label: 'New', status: 'PLACED' },
  { label: 'Accepted', status: 'ACCEPTED' },
  { label: 'Preparing', status: 'PREPARING' },
  { label: 'Ready', status: 'READY' },
  { label: 'On the way', status: 'OUT_FOR_DELIVERY' },
  { label: 'Delivered', status: 'DELIVERED' },
];

const NEXT = { PLACED: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY' };
const NEXT_LABEL = { PLACED: 'Accept', ACCEPTED: 'Start preparing', PREPARING: 'Mark ready' };

export default function OrderManagement() {
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState({ type: 'success', text: '' });
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useAsync(
    () => ownerApi.orders({ ...filters, page, page_size: 10 }),
    [filters.status, filters.date_from, filters.date_to, page],
    { pollMs: 30000 },
  );

  const changeFilters = (f) => {
    setFilters(f);
    setPage(1);
  };

  const advance = async (order) => {
    setBusyId(order.id);
    try {
      const updated = await ownerApi.updateStatus(order.id, NEXT[order.status]);
      setMessage({ type: 'success', text: `Order #${order.id} is now ${updated.status}.` });
      reload();
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
          <h1>Order management</h1>
          <p className="muted">Accept orders, update preparation status and assign riders.</p>
        </div>
      </div>

      <div className="tabs scroll">
        {QUICK.map((qf) => (
          <button
            key={qf.label}
            type="button"
            className={filters.status === qf.status ? 'active' : ''}
            onClick={() => changeFilters({ ...filters, status: qf.status })}
          >
            {qf.label}
          </button>
        ))}
      </div>
      <OrderFilters filters={filters} onChange={changeFilters} />

      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="📭" title="No orders match these filters" />
      ) : (
        <OrderList
          orders={data.items}
          show="customer"
          linkTo={(o) => `/owner/orders/${o.id}`}
          renderActions={(o) =>
            NEXT[o.status] ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={busyId === o.id} onClick={() => advance(o)}>
                {NEXT_LABEL[o.status]}
              </button>
            ) : o.status === 'READY' ? (
              <Link className="btn btn-primary btn-sm" to={`/owner/orders/${o.id}#assign`}>
                Assign rider
              </Link>
            ) : null
          }
        />
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}
