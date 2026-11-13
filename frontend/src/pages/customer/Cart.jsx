import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { orderApi } from '../../api/client.js';
import { Alert, EmptyState, VegMark } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { formatMoney } from '../../utils/format.js';

const PAYMENT_METHODS = [
  { value: 'card', label: '💳 Card' },
  { value: 'upi', label: '📱 UPI' },
  { value: 'wallet', label: '👛 Wallet' },
];

export default function Cart() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    delivery_address: user?.address || '',
    contact_phone: user?.phone || '',
    notes: '',
    payment_method: 'card',
  });
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);

  if (cart.count === 0) {
    return (
      <EmptyState icon="🛒" title="Your cart is empty">
        <p className="muted">Add some dishes from a restaurant to get started.</p>
        <Link to="/restaurants" className="btn btn-primary">
          Browse restaurants
        </Link>
      </EmptyState>
    );
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const placeOrder = async (e) => {
    e.preventDefault();
    if (form.delivery_address.trim().length < 5) {
      setError('Please enter a full delivery address.');
      return;
    }
    setError('');
    setPlacing(true);
    try {
      const order = await orderApi.place({
        restaurant_id: cart.restaurant.id,
        items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
        delivery_address: form.delivery_address.trim(),
        contact_phone: form.contact_phone || null,
        notes: form.notes || null,
        payment_method: form.payment_method,
      });
      cart.clearCart();
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section>
      <h1>Your cart</h1>
      <div className="two-col">
        <div className="card">
          <h3>
            From <Link to={`/restaurants/${cart.restaurant.id}`}>{cart.restaurant.name}</Link>
          </h3>
          <ul className="cart-items">
            {cart.items.map((i) => (
              <li key={i.id}>
                <div className="dish-head">
                  <VegMark veg={i.is_veg} />
                  <span>{i.name}</span>
                </div>
                <div className="cart-item-controls">
                  <div className="qty">
                    <button type="button" onClick={() => cart.updateQuantity(i.id, i.quantity - 1)} aria-label={`Decrease ${i.name}`}>
                      −
                    </button>
                    <span>{i.quantity}</span>
                    <button type="button" onClick={() => cart.updateQuantity(i.id, i.quantity + 1)} aria-label={`Increase ${i.name}`}>
                      +
                    </button>
                  </div>
                  <span className="line-price">{formatMoney(i.price * i.quantity)}</span>
                  <button type="button" className="icon-btn" onClick={() => cart.removeItem(i.id)} aria-label={`Remove ${i.name}`}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cart.clearCart}>
            Clear cart
          </button>
        </div>

        <form className="card" onSubmit={placeOrder}>
          <h3>Checkout</h3>
          <Alert>{error}</Alert>
          <label className="field">
            <span>Delivery address</span>
            <textarea rows={2} value={form.delivery_address} onChange={set('delivery_address')} required />
          </label>
          <label className="field">
            <span>Contact phone</span>
            <input type="tel" value={form.contact_phone} onChange={set('contact_phone')} />
          </label>
          <label className="field">
            <span>Notes for the restaurant (optional)</span>
            <input value={form.notes} onChange={set('notes')} placeholder="e.g. less spicy" maxLength={500} />
          </label>
          <fieldset className="field">
            <legend>Payment method (simulated)</legend>
            <div className="chip-row">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.value} className={`chip ${form.payment_method === m.value ? 'selected' : ''}`}>
                  <input type="radio" name="payment" value={m.value} checked={form.payment_method === m.value} onChange={set('payment_method')} />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
          <dl className="totals">
            <dt>Subtotal</dt>
            <dd>{formatMoney(cart.subtotal)}</dd>
            <dt>Delivery fee</dt>
            <dd>{formatMoney(cart.deliveryFee)}</dd>
            <dt className="total">Total</dt>
            <dd className="total">{formatMoney(cart.total)}</dd>
          </dl>
          <p className="muted small">This is a dummy payment. No money will be charged.</p>
          <button className="btn btn-primary btn-block" disabled={placing}>
            {placing ? 'Placing order…' : `Pay ${formatMoney(cart.total)} & place order`}
          </button>
        </form>
      </div>
    </section>
  );
}
