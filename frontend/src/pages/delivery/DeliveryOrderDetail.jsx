import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deliveryApi } from '../../api/client.js';
import { DeliveryInfo, OrderItems, OrderTracker, StatusHistory } from '../../components/OrderDetails.jsx';
import { Alert, ErrorState, Spinner, StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ACTION_LABEL, formatDateTime } from '../../utils/format.js';

export default function DeliveryOrderDetail() {
  const { id } = useParams();
  const { data: order, loading, error, reload, setData } = useAsync(() => deliveryApi.order(id), [id]);
  const [message, setMessage] = useState({ type: 'success', text: '' });
  const [busy, setBusy] = useState(false);

  if (loading && !order) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const run = async (action) => {
    const status = action.split(':')[1];
    setBusy(true);
    try {
      setData(await deliveryApi.updateStatus(order.id, status));
      setMessage({ type: 'success', text: status === 'DELIVERED' ? 'Delivered — great job! 🎉' : 'Marked as out for delivery.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const actions = order.allowed_actions.filter((a) => a.startsWith('status:'));
  const active = ['ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.status);

  return (
    <section>
      <Link to={active ? '/delivery' : '/delivery/history'} className="back-link">
        ← Back to deliveries
      </Link>
      <div className="page-head">
        <div>
          <h1>Delivery · Order #{order.id}</h1>
          <p className="muted">
            Pick up from <strong>{order.restaurant.name}</strong> · placed {formatDateTime(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      <div className="card">
        <OrderTracker order={order} />
        {actions.length > 0 && (
          <div className="row-actions center">
            {actions.map((a) => (
              <button key={a} type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => run(a)}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="two-col">
        <DeliveryInfo order={order} />
        <div className="stack">
          <OrderItems order={order} />
          <StatusHistory order={order} />
        </div>
      </div>
    </section>
  );
}
