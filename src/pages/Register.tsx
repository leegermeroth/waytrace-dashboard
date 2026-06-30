import { Navigate } from 'react-router-dom'

// Public self-serve registration is disabled — accounts are created via
// Stripe Checkout. This redirect keeps any stale /register links from 404ing.
export default function Register() {
  return <Navigate to="/login" replace />
}
