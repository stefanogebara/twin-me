/**
 * Admin access — single source of truth for "is this user an admin?".
 *
 * The platform predates this helper with TWO separate backend admin gates:
 *   - requireProfessor (api/middleware/auth.js): DB `users.role` in {admin, professor}
 *   - requireAdminEmail (api/routes/admin-beta.js): email in ADMIN_EMAILS allowlist
 *
 * The frontend admin-route gate must never be STRICTER than the backend, or a
 * legitimate admin gets bounced from the page shell while the API would still
 * serve them. So `isAdmin` is the UNION: true if the user could pass EITHER
 * backend gate. Per-endpoint middleware still enforces the specific gate — this
 * boolean is only a coarse, defense-in-depth signal the SPA can mirror so it
 * never renders an admin shell for a non-admin.
 *
 * Why the email allowlist is the load-bearing signal today: `role` is not
 * carried in the JWT and (as of this writing) is absent from the tracked
 * `users` migrations, so selecting it on the hot /auth/verify path would risk
 * breaking every login if the column is missing in an environment. The email
 * is always present on the row and in the token, and ADMIN_EMAILS is the gate
 * for the most prominent admin surface (/admin/beta), so email alone keeps the
 * real admins unaffected. `role` is honored here too so the union "just works"
 * the moment a caller chooses to supply it.
 */

const ADMIN_ROLES = new Set(['admin', 'professor']);

/**
 * Parse ADMIN_EMAILS (comma-separated) into a normalized, lowercased list.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function getAdminEmailAllowlist(env = process.env) {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether a user is an admin, from an optional DB role and/or email.
 * Union of the two backend gates — either qualifies.
 *
 * @param {{ role?: string | null, email?: string | null }} [user]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function computeIsAdmin({ role, email } = {}, env = process.env) {
  if (role && ADMIN_ROLES.has(String(role).trim().toLowerCase())) {
    return true;
  }
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized) return false;
  return getAdminEmailAllowlist(env).includes(normalized);
}
