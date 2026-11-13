import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';

const LINKS = {
  guest: [{ to: '/restaurants', label: 'Restaurants' }],
  customer: [
    { to: '/restaurants', label: 'Restaurants' },
    { to: '/orders', label: 'My Orders' },
    { to: '/insights', label: 'AI Insights' },
  ],
  restaurant_owner: [
    { to: '/owner', label: 'Dashboard', end: true },
    { to: '/owner/orders', label: 'Orders' },
    { to: '/owner/menu', label: 'Menu' },
    { to: '/owner/returns', label: 'Returns' },
  ],
  delivery_partner: [
    { to: '/delivery', label: 'Deliveries', end: true },
    { to: '/delivery/history', label: 'History' },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const links = LINKS[user?.role || 'guest'];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          🍔 Campus<span>Bite</span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ☰
        </button>

        <nav className={`nav-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
          {user?.role === 'customer' && (
            <NavLink to="/cart" className="cart-link">
              🛒 Cart {count > 0 && <span className="cart-count">{count}</span>}
            </NavLink>
          )}
          {user ? (
            <div className="nav-user">
              <span className="nav-user-name" title={ROLE_LABEL[user.role]}>
                {user.name.split(' ')[0]} <small>· {ROLE_LABEL[user.role]}</small>
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={handleLogout}>
                Log out
              </button>
            </div>
          ) : (
            <div className="nav-user">
              <NavLink to="/login">Log in</NavLink>
              <Link to="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
