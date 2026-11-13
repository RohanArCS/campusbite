import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ownerApi } from '../../api/client.js';
import { DeliveryInfo, OrderItems, OrderTracker, PaymentInfo, StatusHistory } from '../../components/OrderDetails.jsx';
import { Alert, ErrorState, Spinner, StarRating, StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ACTION_LABEL, formatDateTime } from '../../utils/format.js';

function AssignPartner({ order, onAssigned, onError }) {
  const partners = useAsync(() => ownerApi.partners(), []);
  const [partnerId, setPartnerId] = useState(order.delivery_partner?.id || '');
  const [busy, setBusy] = useState(false);

  const assign = async (e) => {
    e.preventDefault();
    if (!partnerId) return;
    setBusy(true);
    try {
      onAssigned(await ownerApi.assign(order.id, Number(partnerId)));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="assign" className="card" onSubmit={assign}>
      <h3>{order.status === 'ASSIGNED' ? 'Reassign delivery partner' : 'Assign delivery partner'}</h3>
      {partners.loading ? (
        <Spinner label="Loading partners…" />
      ) : partners.error ? (
        <Alert>{partners.error.message}</Alert>
      ) : (
        <div className="inline-form">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} aria-label="Delivery partner">
            <option value="">Select a partner…</option>
            {partners.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.active_deliveries} active
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={busy || !partnerId || Number(partnerId) === order.delivery_partner?.id}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}
    </form>
  );
}

function ResolveReturn({ order, onResolved, onError }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (approve) => {
    // eslint-disable-next-line no-alert
    if (approve && !window.confirm('Approve and refund the full order amount?')) return;
    setBusy(true);
    try {
      const fn = approve ? ownerApi.approveReturn : ownerApi.rejectReturn;
      onResolved(await fn(order.return_request.id, note || null));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card highlight">
      <h3>Return request</h3>
      <p>“{order.return_request.reason}”</p>
      <p className="muted small">Requested {formatDateTime(order.return_request.created_at)}</p>
      <label className="field">
        <span>Note to customer (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
          Approve & refund
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => decide(false)}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default function OwnerOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data: order, loading, error, reload, setData } = useAsync(() => ownerApi.order(id), [id]);
  const [message, setMessage] = useState({ type: 'success', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order && location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, [order?.id, location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !order) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const statusActions = order.allowed_actions.filter((a) => a.startsWith('status:'));
  const updated = (o, text) => {
    setData(o);
    setMessage({ type: 'success', text });
  };
  const fail = (text) => setMessage({ type: 'error', text });

  const runAction = async (action) => {
    const status = action.split(':')[1];
    // eslint-disable-next-line no-alert
    if (status === 'CANCELLED' && !window.confirm('Reject this order? The customer will be refunded.')) return;
    setBusy(true);
    try {
      updated(await ownerApi.updateStatus(order.id, status), `Order moved to ${status}.`);
    } catch (err) {
      fail(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Link to="/owner/orders" className="back-link">
        ← All orders
      </Link>
      <div className="page-head">
        <div>
          <h1>Order #{order.id}</h1>
          <p className="muted">
            {order.customer?.name} · placed {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="badges">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.payment_status} />
          {order.return_status && <StatusBadge status={order.return_status} />}
        </div>
      </div>

      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      <div className="card">
        <OrderTracker order={order} />
        {statusActions.length > 0 && (
          <div className="row-actions center">
            {statusActions.map((a) => (
              <button
                key={a}
                type="button"
                className={`btn ${a === 'status:CANCELLED' ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => runAction(a)}
              >
                {ACTION_LABEL[a] || a}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="two-col">
        <div className="stack">
          {order.allowed_actions.includes('assign') && (
            <AssignPartner order={order} onAssigned={(o) => updated(o, 'Delivery partner assigned.')} onError={fail} />
          )}
          {order.allowed_actions.includes('resolve_return') && (
            <ResolveReturn order={order} onResolved={(o) => updated(o, `Return ${o.return_status}.`)} onError={fail} />
          )}
          <OrderItems order={order} />
          {order.review && (
            <div className="card">
              <h3>Customer review</h3>
              <StarRating value={order.review.rating} />
              {order.review.comment && <p>{order.review.comment}</p>}
            </div>
          )}
        </div>
        <div className="stack">
          <DeliveryInfo order={order} />
          <PaymentInfo order={order} />
          <StatusHistory order={order} />
        </div>
      </div>
    </section>
  );
}
