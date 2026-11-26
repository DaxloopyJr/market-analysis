/** /api/me user.menu is the list of allowed root modules. */
const ROOT = {
  dashboard: { icon: "LayoutDashboard", path: "/dashboard" },
  submissions: { icon: "Send" },
  "dataset-management": { icon: "Database" },
  administration: { icon: "Settings2" },
  analytics: { icon: "ChartNoAxesCombined", path: "/dashboard/analytics" },
  reports: { icon: "FileBarChart2", path: "/dashboard/reports" },
  "audit-logs": { icon: "ScrollText", path: "/dashboard/audit-logs" },
  notifications: { icon: "Bell", path: "/dashboard/notifications" },
};
const CHILD = {
  datasets: { path: "/dashboard/datasets", icon: "TableProperties", grants: ["datasets.view","datasets.configure"] },
  // Reference Types/Values read: authenticated user; manage: reference_data.manage.
  "reference-data": { path: "/dashboard/reference-data", icon: "Database", grants: [] },
  "submission-periods": { path: "/dashboard/submission-periods", icon: "CalendarClock", grants: ["submission_periods.view","submission_periods.configure"] },
  // Strategic Plans (29 Oct 2026, endpoints 133–140): shown by role (see STRATEGIC_PLAN_ROLES); Laravel enforces scope.
  "strategic-plans": { path: "/dashboard/strategic-plans", icon: "Target", grants: [] },
  // Namba Kuu za Kitaifa (9 Nov 2026): M&E proposes, MDD approves; never MOA.
  institutions: { path: "/dashboard/administration/institutions", icon: "Building2", grants: ["institutions.manage","institutions.view.own"] },
  departments: { path: "/dashboard/administration/departments", icon: "Building", grants: ["departments.manage"] },
  // Institutional Admins are users with role IA; contract grants users.manage.*.
  "institutional-admins": { path: "/dashboard/administration/institution-admins", icon: "UserCog", grants: ["users.manage.ministry", "users.manage.institution"] },
  "institution-admins": { path: "/dashboard/administration/institution-admins", icon: "UserCog", grants: ["users.manage.ministry", "users.manage.institution"] },
  users: { path: "/dashboard/administration/users", icon: "Users", grants: ["users.manage.ministry","users.manage.institution"] },
  roles: { path: "/dashboard/administration/roles-permissions", icon: "ShieldCheck", grants: ["roles.manage"] },
  "portal-settings": { path: "/dashboard/administration/portal-settings", icon: "SlidersHorizontal", grants: ["portal_settings.manage"] },
  "approval-circle": { path: "/dashboard/administration/approval-circle", icon: "Workflow", grants: ["approval_circle.manage.ministry","approval_circle.manage.institution"] },
  // VERIFIED: Delegations GET/POST/revoke are restricted to roles.manage (MOA).
  delegations: { path: "/dashboard/administration/delegations", icon: "UsersRound", grants: ["roles.manage"] },
};
function submissionMenu(user) {
  const p = new Set(user.permissions);
  const roleCodes = new Set(user.roles.map((r) => r.code));
  const officer = roleCodes.has("IDO") || roleCodes.has("DDO");
  const assignedInstitutionReviewer = user.menu?.find(item=>item.key==="submissions")?.children?.some(child=>["hod-inbox","institution-review","pending-review"].includes(child.key) || child.path==="/dashboard/hod/inbox");
  const hod = p.has("submissions.review") && (assignedInstitutionReviewer || p.has("submissions.review.institution") || p.has("submissions.review.own") || roleCodes.has("IHOD") || roleCodes.has("HOD"));
  const ao = roleCodes.has("AO") && p.has("submissions.approve");
  const mdo = roleCodes.has("MDO") && p.has("submissions.review");
  const mdd = roleCodes.has("MDD") && (p.has("submissions.approve") || p.has("submissions.publish"));
  const items = [];
  // Ministry admin (10 Nov 2026): monitoring only; approvals stay with the workflow roles.
  if (roleCodes.has("MOA") && !officer) {
    if (p.has("submissions.view.scope")) items.push({id:"monitor",label:"Submission Monitoring",icon:"ClipboardList",path:"/dashboard/submissions/monitor"});
    return items;
  }
  if (officer && p.has("submissions.view.scope")) {
    items.push({id:"my-submissions",label:"My Submissions",icon:"ClipboardList",path:"/dashboard/submissions/my"});
  } else if (hod) {
    items.push(
      {id:"hod-inbox",label:"Pending Review",icon:"Clock3",path:"/dashboard/hod/inbox"},
      {id:"hod-history",label:"Reviewed",icon:"History",path:"/dashboard/hod/history"}
    );
  } else if (ao) {
    items.push(
      {id:"ao-pending",label:"Pending Approval",icon:"Clock3",path:"/dashboard/ao/pending"},
      {id:"ao-reviewed",label:"Reviewed",icon:"History",path:"/dashboard/ao/reviewed"}
    );
  } else if (mdd) {
    items.push(
      {id:"mdd-queue",label:"Pending Review",icon:"Clock3",path:"/dashboard/mdd/queue"},
      {id:"mdd-reviewed",label:"Reviewed",icon:"History",path:"/dashboard/mdd/reviewed"},
      {id:"mdd-published",label:"Published",icon:"Eye",path:"/dashboard/mdd/published"},
      {id:"mdd-returned",label:"Returned",icon:"RotateCcw",path:"/dashboard/mdd/returned"}
    );
  } else if (mdo) {
    items.push(
      {id:"mdo-queue",label:"Ministry Review Queue",icon:"ListChecks",path:"/dashboard/mdo/queue"},
      {id:"mdo-reviewed",label:"Reviewed Submissions",icon:"History",path:"/dashboard/mdo/reviewed"},
      {id:"mdo-returned",label:"Returned to Institutions",icon:"RotateCcw",path:"/dashboard/mdo/returned"}
    );
  } else if (p.has("submissions.view.scope")) {
    items.push({id:"monitor",label:"Institution Submissions",icon:"ClipboardList",path:"/dashboard/submissions/monitor"});
  }
  if (officer && p.has("submissions.create")) {
    items.splice(1, 0, {id:"new",label:"New Submission",icon:"FilePlus2",path:"/dashboard/submissions/new"});
  }
  if (!hod && !ao && !mdo && !mdd && ["submissions.review","submissions.approve","submissions.publish"].some((x) => p.has(x))) {
    items.push({id:"approvals",label:"Approval Queue",icon:"ListChecks",path:"/dashboard/submissions/approvals"});
  }
  if (!mdd && p.has("submissions.view.approved")) {
    items.push({id:"published",label:"Published Submissions",icon:"Eye",path:"/dashboard/submissions/published"});
  }
  return items;
}
export function getVisibleMenu(user) {
  if (!user || !Array.isArray(user.menu) || !Array.isArray(user.permissions)) return [];
  const p = new Set(user.permissions);
  const visible = user.menu.flatMap((raw) => {
    const root = ROOT[raw.key];
    if (!root) return [];
    if (raw.key === "dashboard") return p.has("dashboard.view")
      ? [{id:raw.key,label:raw.label,...root,end:true}] : [];
    if (raw.key === "submissions") {
      const children = submissionMenu(user);
      return children.length ? [{id:raw.key,label:raw.label,icon:root.icon,children}] : [];
    }
    if (["dataset-management","administration"].includes(raw.key)) {
      // Keep server-defined menu order. Reference Data has a new documented
      // permission; allow managed access under the existing Dataset Management
      // root while /api/me menu is being updated by the backend team.
      const incoming = Array.isArray(raw.children) ? [...raw.children] : [];
      if (raw.key === "dataset-management" && p.has("reference_data.manage") &&
          !incoming.some((child) => child.key === "reference-data")) {
        incoming.push({ key: "reference-data", label: "Reference Data" });
      }
      // MOA may manage all reporting periods. If /me has not added this
      // navigation entry yet, surface it under the EXISTING Dataset root.
      // Every API write still requires Laravel approval.
      const isMOA=user.roles?.some(r=>(typeof r==='string'?r:r.code)==='MOA')||user.role_code==='MOA';
      if(raw.key==='dataset-management' && isMOA && !incoming.some(c=>c.key==='submission-periods')) {
        incoming.push({key:'submission-periods',label:'Submission Periods'});
      }
      const children = incoming.flatMap((c) => {
        // Centralized calendar administration. Only MOA manages period definitions.
        // Laravel still MUST enforce role+scope on all period mutation endpoints.
        if (c.key === "submission-periods" && !isMOA) return [];
        const mapped = CHILD[c.key];
        if (!mapped || (mapped.grants.length && !mapped.grants.some((g) => p.has(g)) && !(c.key === 'submission-periods' && isMOA))) return [];
        return [{id:c.key,label:c.label,icon:mapped.icon,path:mapped.path}];
      });
      return children.length ? [{id:raw.key,label:raw.label,icon:root.icon,children}] : [];
    }
    const allowed = {
      analytics: ["analytics.view.ministry","analytics.view.institution","analytics.view.own","analytics.view.published"],
      reports: ["reports.view.ministry","reports.view.institution","reports.view.own"],
      "audit-logs": ["audit_logs.view.ministry","audit_logs.view.institution"],
    };
    return (allowed[raw.key] || []).some((x) => p.has(x)) ? [{id:raw.key,label:raw.label,...root}] : [];
  });

  // HOD can have submissions.review while Laravel /me.menu has not yet added
  // the submissions navigation root. Expose only the HOD route (not an IDO draft
  // or administrative menu). React HodAccess and Laravel protect the records.
  const hodRoles=(user.roles||[]).map(role=>String(typeof role==='string'?role:role.code).toUpperCase());
  const isHod=p.has('submissions.review') && (p.has('submissions.review.institution') || p.has('submissions.review.own') || hodRoles.includes('HOD') || hodRoles.includes('IHOD') || user.menu?.find(item=>item.key==='submissions')?.children?.some(c=>['hod-inbox','institution-review','pending-review'].includes(c.key)));
  const isAO=(user.roles||[]).some(role=>String(typeof role==='string'?role:role.code).toUpperCase()==='AO') && p.has('submissions.approve');
  const isMDO=(user.roles||[]).some(role=>String(typeof role==='string'?role:role.code).toUpperCase()==='MDO') && p.has('submissions.review');
  const isMDD=(user.roles||[]).some(role=>String(typeof role==='string'?role:role.code).toUpperCase()==='MDD') && (p.has('submissions.approve')||p.has('submissions.publish'));
  if((isHod || isAO || isMDO || isMDD) && !visible.some(root=>root.id==='submissions')) {
    visible.push({id:'submissions',label:'Submissions',icon:ROOT.submissions.icon,children:submissionMenu(user)});
  }
  // Previewer (analytics.view.published, 28 Oct 2026): Laravel grants cross-institution PUBLISHED analytics
  // and no submission/dataset actions. If /me has not listed the menu entries yet, show Institution
  // Analytics and Reports (read-only pages; Laravel still scopes every analytics request).
  const previewer = p.has('analytics.view.published');
  if (previewer && !visible.some(item => item.id === 'analytics')) visible.push({id:'analytics',label:'Institution Analytics',...ROOT.analytics});
  if (previewer && !visible.some(item => item.id === 'reports')) visible.push({id:'reports',label:'Reports',...ROOT.reports});
  if (previewer && !visible.some(item => item.path === '/dashboard/notifications')) visible.push({id:'notifications',label:'Notifications',...ROOT.notifications});

  // Confirmed GET /notifications is available to every authenticated user.
  // HOD sees its own notifications in Sidebar, matching the approved reference.
  if((isHod || isAO || isMDO || isMDD) && !visible.some(item=>item.path==='/dashboard/notifications')) {
    visible.push({id:'notifications',label:'Notifications',...ROOT.notifications});
  }

  // Laravel /me sometimes grants IA `approval_circle.manage.institution` while
  // omitting the Approval Circle entry from `menu[].children` (or its root).
  // Do not hide an explicitly granted capability because of incomplete menu
  // metadata. This only adds navigation; RouteAccess and Laravel still enforce
  // the user's permissions and the IA institution / MOA ministry scope.
  // IA is the institution-level administrator under the documented role
  // contract. Older /me payloads may omit the menu child AND (incorrectly)
  // omit the scoped permission. Show the navigation for an active IA role but
  // let Laravel GET/POST /approval-circles enforce the actual permission.
  // This does NOT add a permission or expose cross-institution records.
  const today = new Date().toISOString().slice(0, 10);
  const isIA = user.role_code === 'IA' || user.roles?.some(role => {
    if ((typeof role === 'string' ? role : role?.code) !== 'IA') return false;
    const grant = typeof role === 'object' ? role.pivot : null;
    return !grant || ((!grant.status || grant.status === 'active') &&
      (!grant.effective_from || grant.effective_from <= today) &&
      (!grant.effective_to || grant.effective_to >= today));
  });
  const canManageApproval = p.has('approval_circle.manage.institution') ||
    p.has('approval_circle.manage.ministry') || isIA;
  const approvalIsVisible = visible.some(item =>
    item.children?.some(child => child.id === 'approval-circle'));
  if (canManageApproval && !approvalIsVisible) {
    const approvalLink = {
      id: 'approval-circle',
      label: 'Approval Circle',
      icon: CHILD['approval-circle'].icon,
      path: CHILD['approval-circle'].path,
    };
    const administration = visible.find(item => item.id === 'administration');
    if (administration) {
      administration.children = [...administration.children, approvalLink];
    } else {
      visible.push({
        id: 'administration',
        label: 'Administration',
        icon: ROOT.administration.icon,
        children: [approvalLink],
      });
    }
  }
  // Strategic Plans: Laravel has no dedicated permission key yet; show it under Dataset Management
  // for the agreed roles (MOA/MDO/MDD/IA/IDO + readers). The page and Laravel enforce what each role may do.
  const spRoles = new Set((user.roles || []).map(role => String(typeof role === 'string' ? role : role?.code).toUpperCase()));
  if (user.role_code) spRoles.add(String(user.role_code).toUpperCase());
  const spVisible = visible.some(item => item.children?.some(child => child.id === 'strategic-plans'));
  // Same list as STRATEGIC_PLAN_ROLES in utils/strategicPlanAccess.js (kept inline: this file has no imports).
  const strategicPlanRoles = ["MOA", "MDO", "MDD", "IA", "IDO", "DDO", "MAU", "PREVIEW"];
  if (strategicPlanRoles.some(code => spRoles.has(code)) && !spVisible) {
    const spLink = {id: 'strategic-plans', label: 'Strategic Plans', icon: CHILD['strategic-plans'].icon, path: CHILD['strategic-plans'].path};
    const datasetRoot = visible.find(item => item.id === 'dataset-management');
    if (datasetRoot) datasetRoot.children = [...datasetRoot.children, spLink];
    else visible.push({id: 'dataset-management', label: 'Dataset Management', icon: ROOT['dataset-management'].icon, children: [spLink]});
  }
  // Ministry-department users (DDO) never see the word "Institution" (30 Oct 2026).
  // Same rule as utils/orgScope.js userOrgScope (kept inline: this file has no imports).
  const scopeRoles = new Set((user.roles || []).map(role => String(typeof role === 'string' ? role : role?.code).toUpperCase()));
  const ministryWide = ['MOA','MDO','MDD','ME','OMU','DD','PREVIEW','MAU'].some(code => scopeRoles.has(code)) || p.has('analytics.view.ministry') || p.has('analytics.view.published');
  // 8 Nov 2026: users who see institutions AND departments get the neutral "Analytics".
  const department = !ministryWide && (scopeRoles.has('DDO') || (user.department_id && !user.institution_id));
  const analyticsLabel = ministryWide ? 'Analytics' : department ? 'Department Analytics' : null;
  const rename = item => ({...item,
    label: analyticsLabel && item.path === ROOT.analytics.path ? analyticsLabel : (department ? String(item.label ?? '').replace(/Institution Analytics/i, 'Department Analytics') : item.label),
    ...(item.children ? {children: item.children.map(rename)} : {})});
  // One menu order for every role: work first, then analysis, then notifications (MDO/MDD had it shuffled).
  const ORDER = ['dashboard', 'submissions', 'dataset-management', 'administration', 'analytics', 'reports', 'audit-logs', 'notifications'];
  const rank = item => { const i = ORDER.indexOf(item.id); return i < 0 ? ORDER.length : i; };
  // Executives (ME only: Minister, Deputy Minister, PS, Deputy PS) get Dashboard, Analytics and Reports (agreed 8 Nov 2026).
  const executiveOnly = scopeRoles.has('ME') && [...scopeRoles].every(code => code === 'ME');
  const shown = executiveOnly ? visible.filter(item => ['dashboard', 'analytics', 'reports'].includes(item.id)) : visible;
  return shown.map(rename).map((item, i) => ({item, i})).sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i).map(({item}) => item);
}
export function findMenuByPath(path,user) {
  const visible = getVisibleMenu(user);
  if (/^\/dashboard\/hod\/history\/\d+$/.test(path)) {
    return visible.flatMap(m=>m.children||[]).find(c=>c.id==='hod-history') || null;
  }
  if (/^\/dashboard\/hod\/review\/\d+$/.test(path)) {
    return visible.flatMap(m=>m.children||[]).find(c=>c.id==='hod-inbox') || null;
  }
  if (/^\/dashboard\/reports\/[a-z0-9-]+$/.test(path)) {
    return visible.find(m=>m.path==='/dashboard/reports') || visible.flatMap(m=>m.children||[]).find(c=>c.path==='/dashboard/reports') || null;
  }
  if (/^\/dashboard\/ao\/review\/\d+$/.test(path)) {
    return visible.flatMap(m=>m.children||[]).find(c=>c.id==='ao-pending') || null;
  }
  if (/^\/dashboard\/mdd\/source\/(institution|department)\/\d+$/.test(path) || /^\/dashboard\/mdd\/review\/\d+$/.test(path)) {
    return visible.flatMap(m=>m.children||[]).find(c=>c.id==='mdd-queue') || null;
  }
  if (/^\/dashboard\/mdo\/(source\/(institution|department)\/\d+|review\/\d+)$/.test(path)) {
    return visible.flatMap(m=>m.children||[]).find(c=>c.id==='mdo-queue') || null;
  }
  if (/^\/dashboard\/analytics\/(institution|department)\/\d+(\/dataset\/\d+|\/report)?$/.test(path)) {
    return visible.find(m=>m.path==="/dashboard/analytics") || visible.flatMap(m=>m.children||[]).find(c=>c.path==="/dashboard/analytics") || null;
  }
  if (path === "/dashboard/data-entry") {
    return visible.flatMap((m)=>m.children || []).find((c)=>c.path==="/dashboard/submissions/new") || null;
  }
  if (path === "/dashboard/submissions") return visible.find((m)=>m.id==="submissions") || null;
  for (const m of visible) {
    if (m.path===path) return m;
    const child=m.children?.find((c)=>c.path===path);
    if (child) return child;
  }
  return null;
}
