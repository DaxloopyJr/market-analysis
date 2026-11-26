/**
 * FILE: src/utils/strategicPlanAccess.js
 * Who sees which Strategic Plan action (UI only — Laravel enforces the real rules).
 * Agreed with the product owner (29 Oct 2026):
 *  - Ministry (MIT) plan: MOA creates/edits/activates the plan; MOA, MDO, MDD add/edit objectives.
 *  - Institution plan: IA creates/edits/activates its own plan; IA and IDO add/edit objectives.
 * Backend note: Laravel currently also lets MDO/MDD create the MIT plan, and does NOT yet let IDO
 * write objectives (IDO calls will return 403 until Laravel grants it).
 */
import { roleCodes, userInstitutionId } from "./datasetOwnership.js";

const MINISTRY_PLAN = ["MOA"];
const MINISTRY_OBJECTIVES = ["MOA", "MDO", "MDD"];
const INSTITUTION_PLAN = ["IA"];
const INSTITUTION_OBJECTIVES = ["IA", "IDO"];
export const STRATEGIC_PLAN_ROLES = [...new Set([...MINISTRY_OBJECTIVES, ...INSTITUTION_OBJECTIVES, "DDO", "MAU", "PREVIEW"])];

const has = (roles, list) => roles.some((role) => list.includes(role));

export function strategicPlanAccess(user, ministryInstitutionId = null) {
  const roles = roleCodes(user);
  const ministry = has(roles, MINISTRY_OBJECTIVES);
  const ownInstitution = userInstitutionId(user);
  const ownsPlan = (plan) => plan && String(plan.institutionId) === String(ownInstitution);
  const isMinistryPlan = (plan) => plan && ministryInstitutionId != null && String(plan.institutionId) === String(ministryInstitutionId);
  return {
    roles,
    ministry,
    canRead: has(roles, STRATEGIC_PLAN_ROLES),
    /** Create a new plan: MOA (MIT or any owner), IA (own institution). */
    canCreatePlan: has(roles, MINISTRY_PLAN) || has(roles, INSTITUTION_PLAN),
    /** Edit/activate plan metadata. */
    canManagePlan: (plan) => has(roles, MINISTRY_PLAN) || (has(roles, INSTITUTION_PLAN) && ownsPlan(plan)),
    /** Add/edit objectives and versions. */
    canManageObjectives: (plan) => has(roles, ["MOA"])
      || (has(roles, ["MDO", "MDD"]) && (isMinistryPlan(plan) || ownsPlan(plan)))
      || (has(roles, INSTITUTION_OBJECTIVES) && ownsPlan(plan)),
  };
}
