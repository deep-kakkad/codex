import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="auth-page">
      <div className="card auth-card center">
        <h1>Page not found</h1>
        <p className="muted">The link may be wrong or out of date.</p>
        <Link to="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
