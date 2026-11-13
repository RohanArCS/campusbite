/* Small reusable UI building blocks used across all pages. */
import { useEffect } from 'react';
import { STATUS_LABEL } from '../utils/format.js';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card empty">
      <p className="empty-icon">⚠️</p>
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-outline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = '🍽️', title, children }) {
  return (
    <div className="card empty">
      <p className="empty-icon">{icon}</p>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{STATUS_LABEL[status] || status}</span>;
}

export function StatCard({ label, value, hint, accent }) {
  return (
    <div className={`stat-card ${accent ? `stat-${accent}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return total ? <p className="muted small center">{total} result(s)</p> : null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      <span className="muted small">
        Page {page} of {pages} · {total} total
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StarRating({ value, onChange, size = 'md' }) {
  return (
    <div className={`stars stars-${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${value || 0} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className={n <= value ? 'star on' : 'star'}
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value || 0) ? 'star on' : 'star'}>
            ★
          </span>
        ),
      )}
    </div>
  );
}

export function VegMark({ veg }) {
  return <span className={`veg-mark ${veg ? 'veg' : 'nonveg'}`} title={veg ? 'Vegetarian' : 'Non-vegetarian'} />;
}
