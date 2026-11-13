import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ownerApi } from '../../api/client.js';
import { Alert, EmptyState, ErrorState, Pagination, Spinner, StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime, formatMoney } from '../../utils/format.js';

const TABS = [
  { label: 'Pending', value: 'requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: '' },
];

export default function ReturnRequests() {
  const [status, setStatus] = useState('requested');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState({ type: 'success', text: '' });
  const [busyId, setBusyId] = useState(null);
  const { data, loading, error, reload } = useAsync(() => ownerApi.returns({ status, page, page_size: 10 }), [status, page]);

  const decide = async (rr, approve) => {
    // eslint-disable-next-line no-alert
    if (approve && !window.confirm(`Approve return for order #${rr.order_id} and refund ${formatMoney(rr.order_total)}?`)) return;
    setBusyId(rr.id);
    try {
      if (approve) await ownerApi.approveReturn(rr.id, null);
      else await ownerApi.rejectReturn(rr.id, null);
      setMessage({ type: 'success', text: `Return for order #${rr.order_id} ${approve ? 'approved and refunded' : 'rejected'}.` });
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
          <h1>Return & refund requests</h1>
          <p className="muted">Approving a request refunds the dummy payment and marks the order REFUNDED.</p>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            className={status === t.value ? 'active' : ''}
            onClick={() => {
              setStatus(t.value);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="✅" title="No return requests here" />
      ) : (
        <ul className="order-list">
          {data.items.map((rr) => (
            <li key={rr.id} className="card return-card">
              <div className="return-main">
                <div className="order-row-title">
                  <Link to={`/owner/orders/${rr.order_id}`}>
                    <strong>Order #{rr.order_id}</strong>
                  </Link>
                  <span>{rr.customer_name}</span>
                  <StatusBadge status={rr.status} />
                </div>
                <p>“{rr.reason}”</p>
                <p className="muted small">
                  {formatDateTime(rr.created_at)} · {formatMoney(rr.order_total)}
                  {rr.resolution_note && <> · Note: {rr.resolution_note}</>}
                </p>
              </div>
              {rr.status === 'requested' && (
                <div className="row-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busyId === rr.id} onClick={() => decide(rr, true)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busyId === rr.id} onClick={() => decide(rr, false)}>
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </section>
  );
}
