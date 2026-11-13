import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <EmptyState icon="🧭" title="Page not found">
      <p className="muted">The page you are looking for doesn’t exist.</p>
      <Link to="/" className="btn btn-primary">
        Go home
      </Link>
    </EmptyState>
  );
}
