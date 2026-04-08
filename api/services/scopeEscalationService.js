/**
 * Scope Escalation Service — Incremental OAuth scope upgrades
 * When a department needs write access, guide the user to re-authorize
 * with additional scopes, not all scopes at once.
 */

import { GOOGLE_WORKSPACE_SCOPES_READONLY } from '../config/googleWorkspaceScopes.js';
import { createLogger } from './logger.js';

const log = createLogger('ScopeEscalation');

// Scopes needed per department (write-level only — read scopes are always included)
const DEPARTMENT_SCOPES = Object.freeze({
  communications: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
  ],
  scheduling: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
});

/**
 * Return the full scope set for a department: read-only base + department write scopes.
 */
export function getScopesForDepartment(department) {
  const deptScopes = DEPARTMENT_SCOPES[department] || [];
  return [...GOOGLE_WORKSPACE_SCOPES_READONLY, ...deptScopes];
}

/**
 * Check whether the user's stored token already covers the write scopes
 * needed by the given department.
 *
 * For now this checks the global env flag. In production, compare the
 * token's granted scopes (stored at OAuth time) against DEPARTMENT_SCOPES.
 */
export async function checkUserHasWriteScopes(userId, department) {
  const neededScopes = DEPARTMENT_SCOPES[department];
  if (!neededScopes || neededScopes.length === 0) return true;

  // TODO: Query user's stored token scopes from DB and compare
  // For now, fall back to the global feature flag
  const hasScopes = process.env.GOOGLE_WORKSPACE_FULL_SCOPES === 'true';

  if (!hasScopes) {
    log.info('User missing write scopes for department', {
      userId,
      department,
      neededScopes,
    });
  }

  return hasScopes;
}

/**
 * Return the list of departments that require additional OAuth scopes.
 */
export function getDepartmentsNeedingScopes() {
  return Object.keys(DEPARTMENT_SCOPES);
}
