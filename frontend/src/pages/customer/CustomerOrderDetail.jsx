import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { orderApi } from '../../api/client.js';
import { DeliveryInfo, OrderItems, OrderTracker, PaymentInfo, StatusHistory } from '../../components/OrderDetails.jsx';
import { Alert, ErrorState, Spinner, StarRating, StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime } from '../../utils/format.js';

const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY'];

function ReviewForm({ orderId, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Please choose a star rating.');
    setBusy(true);
    setError('');
    try {
      onDone(await orderApi.review(orderId, { rating, comment }), 'Thanks for your review!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <form id="review" className="card" onSubmit={submit}>
      <h3>Rate this order</h3>
      <Alert>{error}</Alert>
      <StarRating value={rating} onChange={setRating} size="lg" />
      <label className="field">
        <span>Comment (optional)</span>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}

function ReturnForm({ orderId, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 10) return setError('Please describe the problem in at least 10 characters.');
    setBusy(true);
    setError('');
    try {
      onDone(await orderApi.requestReturn(orderId, reason.trim()), 'Return request submitted. The restaurant will review it.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <form id="return" className="card" onSubmit={submit}>
      <h3>Request a return / refund</h3>
      <p className="muted small">You can submit only one request per order.</p>
      <Alert>{error}</Alert>
      <label className="field">
        <span>Reason</span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="What went wrong with your order?" />
      </label>
      <button className="btn btn-outline" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit return request'}
      </button>
    </form>
  );
}

export default function CustomerOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [message, setMessage] = useState(location.state?.justPlaced ? 'Order placed! Payment captured (mock).' : '');
  const [error, setError] = useState('');
  const { data: order, loading, error: loadError, reload, setData } = useAsync(() => orderApi.get(id), [id], {
    pollMs: 15000,
  });

  useEffect(() => {
    if (order && location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, [order?.id, location.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !order) return <Spinner />;
  if (loadError) return <ErrorState error={loadError} onRetry={reload} />;

  const can = (action) => order.allowed_actions.includes(action);
  const onDone = (updated, text) => {
    setData(updated);
    setMessage(text);
  };

  const cancel = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Cancel this order? Your dummy payment will be refunded.')) return;
    try {
      onDone(await orderApi.cancel(order.id), 'Order cancelled and refunded.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section>
      <Link to="/orders" className="back-link">
        ← My orders
      </Link>
      <div className="page-head">
        <div>
          <h1>Order #{order.id}</h1>
          <p className="muted">
            {order.restaurant.name} · placed {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="badges">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.payment_status} />
          {order.return_status && <StatusBadge status={order.return_status} />}
        </div>
      </div>

      <Alert type="success" onClose={() => setMessage('')}>
        {message}
      </Alert>
      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="card">
        <OrderTracker order={order} />
        {ACTIVE.includes(order.status) && <p className="muted small center">This page refreshes automatically.</p>}
        {can('cancel') && (
          <div className="center">
            <button type="button" className="btn btn-danger" onClick={cancel}>
              Cancel order
            </button>
          </div>
        )}
      </div>

      <div className="two-col">
        <div className="stack">
          <OrderItems order={order} />
          {order.review && (
            <div className="card">
              <h3>Your review</h3>
              <StarRating value={order.review.rating} />
              {order.review.comment && <p>{order.review.comment}</p>}
            </div>
          )}
          {can('review') && <ReviewForm orderId={order.id} onDone={onDone} />}
          {can('request_return') && <ReturnForm orderId={order.id} onDone={onDone} />}
        </div>
        <div className="stack">
          <DeliveryInfo order={order} showCustomer={false} />
          <PaymentInfo order={order} />
          <StatusHistory order={order} />
        </div>
      </div>
    </section>
  );
}
