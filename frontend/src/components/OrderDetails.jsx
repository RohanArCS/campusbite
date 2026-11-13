import { formatDateTime, formatMoney, ORDER_FLOW, STATUS_LABEL } from '../utils/format.js';
import { StatusBadge } from './ui.jsx';

/** Visual progress tracker for the order lifecycle. */
export function OrderTracker({ order }) {
  const terminal = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  if (order.status === 'CANCELLED') {
    return <div className="tracker-terminal cancelled">This order was cancelled.</div>;
  }
  const current = order.status === 'REFUNDED' ? ORDER_FLOW.length - 1 : ORDER_FLOW.indexOf(order.status);
  return (
    <div>
      <ol className="tracker" aria-label="Order progress">
        {ORDER_FLOW.map((s, i) => (
          <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''}>
            <span className="tracker-dot">{i < current || (i === current && s === 'DELIVERED') ? '✓' : i + 1}</span>
            <span className="tracker-label">{STATUS_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      {terminal && <div className="tracker-terminal refunded">This order was refunded after delivery.</div>}
    </div>
  );
}

export function OrderItems({ order }) {
  return (
    <div className="card">
      <h3>Items</h3>
      <table className="table">
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.quantity} × {i.name}
              </td>
              <td className="muted small">{formatMoney(i.unit_price)} each</td>
              <td className="right">{formatMoney(i.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Subtotal</td>
            <td className="right">{formatMoney(order.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={2}>Delivery fee</td>
            <td className="right">{formatMoney(order.delivery_fee)}</td>
          </tr>
          <tr className="total-row">
            <td colSpan={2}>Total</td>
            <td className="right">{formatMoney(order.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function DeliveryInfo({ order, showCustomer = true }) {
  return (
    <div className="card">
      <h3>Delivery details</h3>
      <dl className="info-list">
        {showCustomer && order.customer && (
          <>
            <dt>Customer</dt>
            <dd>{order.customer.name}</dd>
          </>
        )}
        <dt>Address</dt>
        <dd>{order.delivery_address}</dd>
        <dt>Phone</dt>
        <dd>{order.contact_phone ? <a href={`tel:${order.contact_phone}`}>{order.contact_phone}</a> : '—'}</dd>
        {order.notes && (
          <>
            <dt>Notes</dt>
            <dd>{order.notes}</dd>
          </>
        )}
        <dt>Restaurant</dt>
        <dd>
          {order.restaurant.name}
          {order.restaurant.address && <span className="muted small"> · {order.restaurant.address}</span>}
        </dd>
        <dt>Rider</dt>
        <dd>{order.delivery_partner ? order.delivery_partner.name : 'Not assigned yet'}</dd>
      </dl>
    </div>
  );
}

export function PaymentInfo({ order }) {
  return (
    <div className="card">
      <h3>Payment</h3>
      <p>
        <StatusBadge status={order.payment_status} />{' '}
        <span className="muted small">via {order.payment_method.toUpperCase()} (dummy payment)</span>
      </p>
      {order.payments.length > 0 && (
        <table className="table small">
          <thead>
            <tr>
              <th>Type</th>
              <th>Reference</th>
              <th>Date</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.payments.map((p) => (
              <tr key={p.id}>
                <td className={p.entry_type === 'refund' ? 'text-success' : ''}>{p.entry_type}</td>
                <td className="mono">{p.reference}</td>
                <td>{formatDateTime(p.created_at)}</td>
                <td className="right">
                  {p.entry_type === 'refund' ? '−' : ''}
                  {formatMoney(p.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {order.return_request && (
        <div className="return-box">
          <p>
            <strong>Return request:</strong> <StatusBadge status={order.return_request.status} />
          </p>
          <p className="small">“{order.return_request.reason}”</p>
          {order.return_request.resolution_note && (
            <p className="small muted">Restaurant: {order.return_request.resolution_note}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusHistory({ order }) {
  return (
    <div className="card">
      <h3>Status history</h3>
      <ul className="history">
        {[...order.history].reverse().map((h) => (
          <li key={h.id}>
            <StatusBadge status={h.to_status} />
            <span className="muted small">{formatDateTime(h.created_at)}</span>
            {h.note && <span className="small"> — {h.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
