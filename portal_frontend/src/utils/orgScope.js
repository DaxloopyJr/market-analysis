/**
 * FILE: src/utils/orgScope.js
 * Which organisation word a signed-in user should see (30 Oct 2026):
 *  - 'department'  : ministry-department users (DDO, or a user with a department and no institution) -> never "Institution"
 *  - 'institution' : institution users (IDO, IHOD, AO, IA …) -> never "Department"
 *  - 'all'         : ministry-wide roles (MOA, MDO, MDD, executives, previewers) -> both
 * Labels only: Laravel still scopes every record.
 */
const MINISTRY_WIDE = new Set(['MOA', 'MDO', 'MDD', 'ME', 'OMU', 'DD', 'PREVIEW', 'MAU', 'SA', 'SUPERADMIN']);
const codeOf = role => String(typeof role === 'string' ? role : role?.code ?? role?.name ?? '').toUpperCase();

export function userOrgScope(user) {
  if (!user) return 'all';
  const roles = new Set([...(user.roles ?? []).map(codeOf), codeOf(user.role_code ?? user.roleCode ?? '')].filter(Boolean));
  if ([...roles].some(code => MINISTRY_WIDE.has(code))) return 'all';
  const perms = new Set(user.permissions ?? []);
  if (perms.has('analytics.view.ministry') || perms.has('analytics.view.published')) return 'all';
  const departmentId = user.department_id ?? user.departmentId ?? user.department?.id ?? null;
  const institutionId = user.institution_id ?? user.institutionId ?? user.institution?.id ?? null;
  if (roles.has('DDO') || (departmentId && !institutionId)) return 'department';
  if (institutionId) return 'institution';
  return 'all';
}

/** "Institution" / "Department" for a page about one organisation of that type. */
export const orgWord = type => (type === 'department' ? 'Department' : 'Institution');

/**
 * Analytics menu / page name (8 Nov 2026): users who see both institutions and ministry departments
 * (MOA, MDO, MDD, executives, previewers) get the neutral "Analytics"; institution users keep
 * "Institution Analytics" and ministry-department users (DDO) keep "Department Analytics".
 */
export const analyticsTitle = user => ({all: 'Analytics', department: 'Department Analytics', institution: 'Institution Analytics'})[userOrgScope(user)];
/** Breadcrumb trail start: "Analytics" alone for ministry-wide users, "Analytics › Institution Analytics" otherwise. */
export const analyticsTrail = (user, linked = true) => (userOrgScope(user) === 'all'
  ? [{text: 'Analytics', ...(linked ? {to: '/dashboard/analytics'} : {})}]
  : [{text: 'Analytics'}, {text: analyticsTitle(user), ...(linked ? {to: '/dashboard/analytics'} : {})}]);
