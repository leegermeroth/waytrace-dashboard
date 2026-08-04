/**
 * Framework-free bridge so the (non-React) API client can tell AuthContext that
 * a token-bearing request came back 401 — a revoked, expired, or deactivated
 * credential mid-session. AuthContext registers a handler that clears the stored
 * session and drops to the `anonymous` auth state; ProtectedRoute then returns
 * the user to /login. Only 401 triggers this: a 403 (insufficient_scope) is a
 * valid session doing a forbidden action and must NOT log the user out.
 */
type UnauthorizedHandler = () => void

let handler: UnauthorizedHandler | null = null

/** Register the session-invalidation handler. Returns an unsubscribe function. */
export function onUnauthorized(cb: UnauthorizedHandler): () => void {
  handler = cb
  return () => {
    if (handler === cb) handler = null
  }
}

/** Called by the API client when an authenticated request returns 401. */
export function notifyUnauthorized(): void {
  handler?.()
}
