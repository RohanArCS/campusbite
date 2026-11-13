import { ORDER_STATUSES, STATUS_LABEL } from '../utils/format.js';

/** Status + date range filters shared by the customer, owner and delivery dashboards. */
export default function OrderFilters({ filters, onChange, statuses = ORDER_STATUSES, showDates = true }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const hasFilters = filters.status || filters.date_from || filters.date_to;

  return (
    <div className="filters">
      <label>
        <span>Status</span>
        <select value={filters.status || ''} onChange={set('status')}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] || s}
            </option>
          ))}
        </select>
      </label>
      {showDates && (
        <>
          <label>
            <span>From</span>
            <input type="date" value={filters.date_from || ''} max={filters.date_to || undefined} onChange={set('date_from')} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={filters.date_to || ''} min={filters.date_from || undefined} onChange={set('date_to')} />
          </label>
        </>
      )}
      {hasFilters && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ status: '', date_from: '', date_to: '' })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
