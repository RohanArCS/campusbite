import { useEffect, useState } from 'react';
import { ownerApi } from '../../api/client.js';
import { Alert, EmptyState, ErrorState, Modal, Pagination, Spinner, VegMark } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatMoney } from '../../utils/format.js';

const blankDish = { name: '', description: '', price: '', category: '', is_veg: false, is_available: true };

function DishForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...blankDish, ...initial, price: initial?.price ?? '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const price = Number(form.price);
    if (form.name.trim().length < 2) return setError('Name must be at least 2 characters.');
    if (Number.isNaN(price) || price < 0 || form.price === '') return setError('Enter a valid, non-negative price.');
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description || null,
        price,
        category: form.category.trim() || null,
        is_veg: form.is_veg,
        is_available: form.is_available,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
    return undefined;
  };

  return (
    <form onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="form-grid">
        <label className="field">
          <span>Dish name</span>
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label className="field">
          <span>Price (₹)</span>
          <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required />
        </label>
        <label className="field">
          <span>Category</span>
          <input value={form.category || ''} onChange={set('category')} placeholder="e.g. Mains" />
        </label>
        <div className="field checks">
          <label className="check">
            <input type="checkbox" checked={form.is_veg} onChange={set('is_veg')} /> Vegetarian
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_available} onChange={set('is_available')} /> Available
          </label>
        </div>
        <label className="field span-2">
          <span>Description</span>
          <textarea rows={2} value={form.description || ''} onChange={set('description')} />
        </label>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save dish'}
        </button>
      </div>
    </form>
  );
}

export default function MenuManagement() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [available, setAvailable] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | dish
  const [message, setMessage] = useState({ type: 'success', text: '' });

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    () => ownerApi.menu({ q: search, available, page, page_size: 10 }),
    [search, available, page],
  );

  const save = async (payload) => {
    if (editing === 'new') await ownerApi.addDish(payload);
    else await ownerApi.updateDish(editing.id, payload);
    setMessage({ type: 'success', text: `“${payload.name}” saved.` });
    setEditing(null);
    reload();
  };

  const toggle = async (dish) => {
    try {
      await ownerApi.setAvailability(dish.id, !dish.is_available);
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const remove = async (dish) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete “${dish.name}”? Past orders keep their copy of this dish.`)) return;
    try {
      await ownerApi.deleteDish(dish.id);
      setMessage({ type: 'success', text: `“${dish.name}” deleted.` });
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Menu management</h1>
          <p className="muted">Add dishes, edit prices and toggle availability.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add dish
        </button>
      </div>

      <Alert type={message.type} onClose={() => setMessage({ ...message, text: '' })}>
        {message.text}
      </Alert>

      <div className="filters">
        <label className="grow">
          <span>Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dish name…" />
        </label>
        <label>
          <span>Availability</span>
          <select
            value={available}
            onChange={(e) => {
              setAvailable(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="true">Available</option>
            <option value="false">Unavailable</option>
          </select>
        </label>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="📋" title="No dishes found">
          <p className="muted">Add your first dish to start receiving orders.</p>
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Category</th>
                <th>Price</th>
                <th>Available</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className={d.is_available ? '' : 'row-muted'}>
                  <td data-label="Dish">
                    <div className="dish-head">
                      <VegMark veg={d.is_veg} />
                      <strong>{d.name}</strong>
                    </div>
                    {d.description && <div className="muted small">{d.description}</div>}
                  </td>
                  <td data-label="Category">{d.category || '—'}</td>
                  <td data-label="Price">{formatMoney(d.price)}</td>
                  <td data-label="Available">
                    <label className="switch">
                      <input type="checkbox" checked={d.is_available} onChange={() => toggle(d)} aria-label={`Toggle availability of ${d.name}`} />
                      <span className="slider" />
                    </label>
                  </td>
                  <td className="right" data-label="Actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(d)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => remove(d)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}

      {editing && (
        <Modal title={editing === 'new' ? 'Add dish' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <DishForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}
