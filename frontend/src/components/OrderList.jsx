import { Link } from 'react-router-dom';
import { formatDateTime, formatMoney, timeAgo } from '../utils/format.js';
import { StatusBadge } from './ui.jsx';

/**
 * Compact list of order summaries. `linkTo(order)` decides where each row goes;
 * `show` toggles which party is displayed (restaurant for customers, customer for owners/riders).
 */
export default function OrderList({ orders, linkTo, show = 'restaurant', renderActions }) {
  return (
    <ul className="order-list">
      {orders.map((o) => (
        <li key={o.id} className="order-row card">
          <Link to={linkTo(o)} className="order-row-main">
            <div>
              <div className="order-row-title">
                <strong>#{o.id}</strong>
                <span>{show === 'restaurant' ? o.restaurant.name : o.customer?.name}</span>
              </div>
              <div className="muted small">
                {formatDateTime(o.created_at)} · {o.item_count} item{o.item_count === 1 ? '' : 's'} · updated{' '}
                {timeAgo(o.status_updated_at)}
                {o.delivery_partner && show !== 'rider' && <> · 🛵 {o.delivery_partner.name}</>}
              </div>
            </div>
            <div className="order-row-meta">
              <strong>{formatMoney(o.total_amount)}</strong>
              <div className="badges">
                <StatusBadge status={o.status} />
                <StatusBadge status={o.payment_status} />
                {o.return_status && <StatusBadge status={o.return_status} />}
              </div>
            </div>
          </Link>
          {renderActions && <div className="order-row-actions">{renderActions(o)}</div>}
        </li>
      ))}
    </ul>
  );
}
