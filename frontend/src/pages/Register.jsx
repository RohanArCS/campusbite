import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { ROLE_HOME, ROLE_LABEL, useAuth } from '../context/AuthContext.jsx';

const initial = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  phone: '',
  address: '',
  role: 'customer',
  restaurantName: '',
  cuisine: '',
  restaurantAddress: '',
};

export default function Register() {
  const { register, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const isOwner = form.role === 'restaurant_owner';

  const validate = () => {
    if (form.name.trim().length < 2) return 'Please enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    if (isOwner && form.restaurantName.trim().length < 2) return 'Please enter your restaurant name.';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone || null,
        address: form.address || null,
      };
      if (isOwner) {
        payload.restaurant = {
          name: form.restaurantName.trim(),
          cuisine: form.cuisine || null,
          address: form.restaurantAddress || null,
        };
      }
      const newUser = await register(payload);
      navigate(ROLE_HOME[newUser.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  return (
    <div className="auth-page">
      <form className="card auth-card wide" onSubmit={onSubmit} noValidate>
        <h1>Create your account</h1>
        <Alert>{error}</Alert>

        <fieldset className="role-picker">
          <legend>I am a…</legend>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <label key={value} className={`role-option ${form.role === value ? 'selected' : ''}`}>
              <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} />
              {value === 'customer' ? '🍽️' : value === 'restaurant_owner' ? '👩‍🍳' : '🛵'} {label}
            </label>
          ))}
        </fieldset>

        <div className="form-grid">
          <label className="field">
            <span>Full name</span>
            <input value={form.name} onChange={set('name')} autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Phone (optional)</span>
            <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          </label>
          {form.role === 'customer' && (
            <label className="field">
              <span>Default delivery address (optional)</span>
              <input value={form.address} onChange={set('address')} autoComplete="street-address" />
            </label>
          )}
        </div>

        {isOwner && (
          <div className="form-grid owner-fields">
            <label className="field">
              <span>Restaurant name</span>
              <input value={form.restaurantName} onChange={set('restaurantName')} />
            </label>
            <label className="field">
              <span>Cuisine</span>
              <input value={form.cuisine} onChange={set('cuisine')} placeholder="e.g. Italian" />
            </label>
            <label className="field span-2">
              <span>Restaurant address</span>
              <input value={form.restaurantAddress} onChange={set('restaurantAddress')} />
            </label>
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="center small">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
