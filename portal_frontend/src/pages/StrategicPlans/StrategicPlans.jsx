/**
 * FILE: src/pages/StrategicPlans/StrategicPlans.jsx
 * ROUTE: /dashboard/strategic-plans            -> plan list
 *        /dashboard/strategic-plans?plan={id}  -> one plan with its objectives
 * NAV: Dataset Management -> Strategic Plans (approved mockups sp-list.png / sp-detail.png, 29 Oct 2026).
 * DATA: API/strategicPlans.js -> Laravel endpoints 133–140. Objectives chosen here are offered to
 *   officers in New Submission (step 1) through submission-context.annualObjectiveContext.
 * ACCESS (UI): utils/strategicPlanAccess.js. Laravel enforces the real role + institution scope.
 * No delete/deactivate actions yet: the API has none (Expired is shown from the end date).
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useOutletContext, useSearchParams} from 'react-router-dom';
import {ArrowLeft, CalendarRange, CheckCircle2, Eye, History, PencilLine, Plus, RefreshCw, Search, Target, X, Zap, FilePenLine} from 'lucide-react';
import Swal from '../../utils/portalAlerts';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import {TableLoader} from '../../components/common/LoadingState';
import {MuBadge, MuHeader, MuKpi, MuSelect, MuSkeleton, MuTabs} from '../../components/modern/ModernUI.jsx';
import {AdmOrg} from '../../components/modern/AdminParts.jsx';
import {countText} from '../../utils/adminDisplay.js';
import {institutionLogoUrl} from '../../utils/institutionLogo.js';
import {userInstitutionId} from '../../utils/datasetOwnership.js';
import {strategicPlanAccess} from '../../utils/strategicPlanAccess.js';
import {listInstitutions} from '../../API/institution';
import {apiError} from '../../API/resourceHelpers';
import {
  activateStrategicPlan, addObjectiveVersion, createObjective, createStrategicPlan, getStrategicPlan,
  latestObjectiveVersions, listStrategicPlans, planFinancialYears, updateObjective, updateStrategicPlan,
} from '../../API/strategicPlans';
import '../Admin/institutions.css';
import '../../styles/admin-modern.css';
import './StrategicPlans.css';

const fmtDate = (value) => {
  const t = Date.parse(value ?? '');
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}) : '—';
};
// 5 Nov 2026: a plan past its end date shows "Expired" (display only). Laravel statuses inactive/deactivated
// /archived show as "Inactive". Deactivating needs a backend endpoint (not offered until it exists).
const todayIso = () => new Date().toISOString().slice(0, 10);
const planState = (plan) => {
  const status = String(plan?.status ?? '').toLowerCase();
  if (['inactive', 'deactivated', 'archived', 'closed'].includes(status)) return 'inactive';
  if (plan?.endDate && String(plan.endDate).slice(0, 10) < todayIso()) return 'expired';
  return status === 'active' ? 'active' : 'draft';
};
const statusTone = (plan) => ({active: 'green', expired: 'red', inactive: 'grey'}[planState(plan)] ?? 'amber');
const statusLabel = (plan) => ({active: 'Active', expired: 'Expired', inactive: 'Inactive'}[planState(plan)] ?? 'Draft');

function Dialog({title, onClose, children}) {
  useEffect(() => {
    const key = (event) => { if (event.key === 'Escape' && !document.querySelector('.swal2-container')) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="vim-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="vim-dialog sp-dialog">
        <header className="vim-dialog-header"><h2>{title}</h2>
          <button className="vim-icon-button" onClick={onClose} type="button" aria-label="Close"><X size={18}/></button></header>
        {children}
      </section>
    </div>, document.body);
}

function Field({label, required, children, hint}) {
  return <label className="sp-field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** Create / edit plan metadata (draft only for edits). */
function PlanForm({plan, institutions, ownInstitutionId, chooseOwner, onClose, onSaved}) {
  const [form, setForm] = useState({
    name: plan?.name ?? '', startDate: plan?.startDate ?? '', endDate: plan?.endDate ?? '',
    institutionId: String(plan?.institutionId ?? ownInstitutionId ?? ''),
  });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((old) => ({...old, [key]: value}));
  const years = planFinancialYears(form.startDate, form.endDate);
  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate) { void Swal.fire({icon: 'error', title: 'Check the form', text: 'Plan name, start date and end date are required.'}); return; }
    if (form.endDate <= form.startDate) { void Swal.fire({icon: 'error', title: 'Check the dates', text: 'End date must be after the start date.'}); return; }
    setBusy(true);
    try {
      const result = plan
        ? await updateStrategicPlan(plan.id, {name: form.name.trim(), startDate: form.startDate, endDate: form.endDate})
        : await createStrategicPlan({name: form.name.trim(), startDate: form.startDate, endDate: form.endDate,
          ...(chooseOwner && form.institutionId ? {institutionId: Number(form.institutionId)} : {})});
      onSaved(result.data);
      void Swal.fire({icon: 'success', title: plan ? 'Plan updated' : 'Draft plan created', text: result.message || (plan ? 'Plan saved.' : 'Add objectives, then activate the plan.')});
    } catch (err) {
      void Swal.fire({icon: 'error', title: plan ? 'Plan not updated' : 'Plan not created', text: apiError(err)});
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <div className="vim-wizard-main sp-form">
      {chooseOwner && !plan && <Field label="Owner" required hint="Ministry departments use the MIT plan; they do not own separate plans.">
        <select className="form-control" value={form.institutionId} onChange={(e) => set('institutionId', e.target.value)}>
          {institutions.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} — ` : ''}{item.name}</option>)}
        </select></Field>}
      <Field label="Plan name" required><input className="form-control" maxLength={255} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. CBE Strategic Plan 2026–2031"/></Field>
      <div className="sp-two">
        <Field label="Start date" required><input type="date" className="form-control" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}/></Field>
        <Field label="End date" required><input type="date" className="form-control" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)}/></Field>
      </div>
      {years.length > 0 && <div className="sp-years" aria-label="Reporting years covered">{years.map((y) => <span key={y}>{y}</span>)}</div>}
      <p className="sp-help">The plan starts as Draft. Objectives become selectable in New Submission only after the plan is activated.</p>
    </div>
    <footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : plan ? 'Save changes' : 'Create draft plan'}</button></footer>
  </form>;
}

/** mode: create (code+description+effectiveFrom) | edit (draft: description/effectiveFrom) | version (active: new version + reason) */
function ObjectiveForm({mode, plan, objective, onClose, onSaved}) {
  const [form, setForm] = useState({
    code: objective?.code ?? '', description: objective?.description ?? '',
    effectiveFrom: mode === 'version' ? '' : (objective?.effectiveFrom ?? plan.startDate ?? ''), reason: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((old) => ({...old, [key]: value}));
  async function submit(event) {
    event.preventDefault();
    if ((mode === 'create' && !form.code.trim()) || !form.description.trim() || !form.effectiveFrom || (mode === 'version' && !form.reason.trim())) {
      void Swal.fire({icon: 'error', title: 'Check the form', text: mode === 'version' ? 'Description, effective date and reason are required.' : 'Code, description and effective date are required.'});
      return;
    }
    setBusy(true);
    try {
      const result = mode === 'create'
        ? await createObjective(plan.id, {code: form.code.trim().toUpperCase(), description: form.description.trim(), effectiveFrom: form.effectiveFrom})
        : mode === 'edit'
          ? await updateObjective(plan.id, objective.objectiveId, {description: form.description.trim(), effectiveFrom: form.effectiveFrom})
          : await addObjectiveVersion(plan.id, objective.objectiveId, {description: form.description.trim(), effectiveFrom: form.effectiveFrom, reason: form.reason.trim()});
      onSaved();
      void Swal.fire({icon: 'success', title: mode === 'create' ? 'Objective added' : mode === 'edit' ? 'Objective updated' : 'New version added', text: result.message || 'Objective saved.'});
    } catch (err) {
      void Swal.fire({icon: 'error', title: 'Objective not saved', text: apiError(err)});
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <div className="vim-wizard-main sp-form">
      {mode === 'create'
        ? <Field label="Code" required hint="Letters/digits, e.g. A or 1.2. Unique within this plan."><input className="form-control sp-code-input" maxLength={40} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="A"/></Field>
        : <div className="sp-objective-head"><span className="sp-code">{objective.code}</span><span>{mode === 'version' ? `New version after v${objective.versionNumber}` : `Editing v${objective.versionNumber} (draft plan)`}</span></div>}
      <Field label="Objective description" required><textarea className="form-control" rows={4} maxLength={10000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Kuimarisha uzalishaji"/></Field>
      <Field label="Effective from" required hint={`Must be within ${fmtDate(plan.startDate)} – ${fmtDate(plan.endDate)}${mode === 'version' ? ' and after the previous version' : ''}.`}>
        <input type="date" className="form-control" min={plan.startDate} max={plan.endDate} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)}/></Field>
      {mode === 'version' && <Field label="Reason for change" required><textarea className="form-control" rows={2} maxLength={2000} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Updated priorities for 2027/2028"/></Field>}
      {mode === 'version' && <p className="sp-help">Submissions already sent keep the old wording. New annual selections use the latest version effective at the start of the reporting year.</p>}
    </div>
    <footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : mode === 'create' ? 'Add objective' : mode === 'edit' ? 'Save objective' : 'Add version'}</button></footer>
  </form>;
}

function VersionHistory({versions, onClose}) {
  return <><div className="vim-wizard-main"><ol className="sp-history">
    {versions.map((version) => <li key={version.objectiveVersionId}>
      <span className="sp-history-badge">v{version.versionNumber}</span>
      <div><b>{version.description}</b><small>Effective {fmtDate(version.effectiveFrom)}{version.reason ? ` · ${version.reason}` : ''}</small></div>
    </li>)}
  </ol></div><footer className="vim-dialog-footer"><button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button></footer></>;
}

function OwnerCell({institutionId, institutions, user}) {
  const own = user?.institution && String(userInstitutionId(user)) === String(institutionId) ? user.institution : null;
  const record = institutions.find((item) => String(item.id) === String(institutionId)) || own;
  if (!record) return <span className="mu-muted">Institution #{institutionId ?? '—'}</span>;
  return <AdmOrg logo={institutionLogoUrl(record)} code={record.code || record.short_name} name={record.name}/>;
}

/* ------------------------------ Plan detail ------------------------------ */
function PlanDetail({planId, access, institutions, user, onBack, onChanged}) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getStrategicPlan(planId).then((data) => { if (alive) setPlan(data); })
      .catch((err) => { if (alive) { setPlan(null); void Swal.fire({icon: 'error', title: 'Plan not loaded', text: apiError(err)}); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [planId, revision]);

  const versions = useMemo(() => Array.isArray(plan?.objectiveVersions) ? plan.objectiveVersions : [], [plan]);
  const objectives = useMemo(() => latestObjectiveVersions(versions), [versions]);
  const years = planFinancialYears(plan?.startDate, plan?.endDate);
  const draft = plan?.status !== 'active';
  const canPlan = plan && access.canManagePlan(plan);
  const canObjectives = plan && access.canManageObjectives(plan);
  const close = () => setModal(null);
  const saved = () => { close(); reload(); onChanged(); };

  async function activate() {
    const answer = await Swal.fire({icon: 'question', showCancelButton: true, confirmButtonText: 'Activate plan', title: 'Activate this strategic plan?',
      text: 'After activation the plan and its objectives are frozen. Changes are added as new objective versions. Officers can then select these objectives in New Submission.'});
    if (!answer.isConfirmed) return;
    try {
      const result = await activateStrategicPlan(plan.id);
      reload(); onChanged();
      void Swal.fire({icon: 'success', title: 'Plan activated', text: result.message || 'Objectives are now selectable for the years this plan covers.'});
    } catch (err) { void Swal.fire({icon: 'error', title: 'Plan not activated', text: apiError(err)}); }
  }

  if (loading && !plan) return <section className="adm-card sp-loading"><MuSkeleton kind="list" rows={8} label="Loading strategic plan…"/></section>;
  if (!plan) return <section className="adm-card"><button type="button" className="mu-btn" onClick={onBack}><ArrowLeft size={15}/> Back to plans</button></section>;

  return <>
    <section className="adm-card sp-plan-head">
      <button type="button" className="sp-back" onClick={onBack}><ArrowLeft size={15}/> All strategic plans</button>
      <div className="sp-plan-title">
        <span className="sp-plan-icon"><Target size={24}/></span>
        <div><h1>{plan.name} <MuBadge tone={statusTone(plan)}>{statusLabel(plan)}</MuBadge></h1>
          <OwnerCell institutionId={plan.institutionId} institutions={institutions} user={user}/></div>
        <div className="sp-plan-actions">
          {canPlan && draft && <button type="button" className="mu-btn" onClick={() => setModal({kind: 'plan'})}><PencilLine size={15}/> Edit details</button>}
          {canObjectives && <button type="button" className="mu-btn" onClick={() => setModal({kind: 'create'})}><Plus size={15}/> Add Objective</button>}
          {canPlan && draft && <button type="button" className="mu-btn sp-activate" onClick={activate} disabled={!objectives.length} title={!objectives.length ? 'Add at least one objective effective at plan start' : undefined}><Zap size={15}/> Activate plan</button>}
        </div>
      </div>
      <div className="sp-meta">
        <div><small>Start date</small><b>{fmtDate(plan.startDate)}</b></div>
        <div><small>End date</small><b>{fmtDate(plan.endDate)}</b></div>
        <div><small>Objectives</small><b>{objectives.length}</b></div>
        <div><small>Activated</small><b className={plan.activatedAt ? '' : 'na'}>{plan.activatedAt ? fmtDate(plan.activatedAt) : '—'}</b></div>
      </div>
      {years.length > 0 && <div className="sp-years" aria-label="Reporting years covered">{years.map((y) => <span key={y}>{y}</span>)}</div>}
    </section>

    <div className="sp-detail-grid">
      <section className="adm-card">
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Objectives</h2><span className="mu-count">{objectives.length}</span></header>
        <div className="vim-table-scroll"><table className="table vim-table mb-0 sp-table"><thead><tr>
          <th>Code</th><th>Objective</th><th>Version</th><th>Effective from</th><th aria-label="Actions"/>
        </tr></thead><tbody>
          {objectives.map((objective) => {
            const history = versions.filter((v) => String(v.objectiveId) === String(objective.objectiveId));
            return <tr key={objective.objectiveId}>
              <td><span className="sp-code">{objective.code}</span></td>
              <td><b className="sp-desc">{objective.description}</b></td>
              <td><MuBadge tone="blue">v{objective.versionNumber}</MuBadge></td>
              <td>{fmtDate(objective.effectiveFrom)}</td>
              <td className="mu-actions"><RowActionsMenu label="Objective actions">
                {canObjectives && draft && <button type="button" title="Edit (draft plan)" aria-label="Edit objective" onClick={() => setModal({kind: 'edit', objective})}><PencilLine size={15}/></button>}
                {canObjectives && !draft && <button type="button" title="New version" aria-label="New objective version" onClick={() => setModal({kind: 'version', objective})}><FilePenLine size={15}/></button>}
                <button type="button" title="Version history" aria-label="Version history" onClick={() => setModal({kind: 'history', objective, history})}><History size={15}/></button>
              </RowActionsMenu></td>
            </tr>;
          })}
          {!loading && !objectives.length && <tr><td colSpan={5} className="vim-empty">No objectives yet.{canObjectives ? ' Use “Add Objective” to create the first one.' : ''}</td></tr>}
        </tbody></table><TableLoader active={loading}/></div>
        <div className="sp-note">{draft
          ? 'While Draft, objectives can be edited. After activation the plan is frozen; changes are added as a new version with an effective date and a reason.'
          : 'This plan is active. Officers choose one of these objectives for each dataset and reporting year in New Submission.'}</div>
      </section>
      <aside className="sp-side">
        <section className="adm-card"><header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>How it works</h2></header>
          <ol className="sp-flow">
            <li className="done"><i><CheckCircle2 size={14}/></i><div><b>Create plan</b><small>Name and start/end dates</small></div></li>
            <li className={draft ? 'on' : 'done'}><i>{draft ? 2 : <CheckCircle2 size={14}/>}</i><div><b>Add objectives</b><small>Code + description, effective date</small></div></li>
            <li className={draft ? '' : 'done'}><i>{draft ? 3 : <CheckCircle2 size={14}/>}</i><div><b>Activate</b><small>Needs ≥1 objective effective at plan start</small></div></li>
            <li className={draft ? '' : 'on'}><i>4</i><div><b>Used in New Submission</b><small>Officer picks the objective for each dataset & year</small></div></li>
          </ol></section>
        <section className="adm-card"><header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Who can do what</h2></header>
          <dl className="sp-roles">
            <div><dt>Ministry plan (MIT)</dt><dd>MOA creates · MOA/MDO/MDD add objectives</dd></div>
            <div><dt>Institution plan</dt><dd>IA creates · IA/IDO add objectives</dd></div>
            <div><dt>Read</dt><dd>Own institution; ministry roles read all</dd></div>
          </dl></section>
      </aside>
    </div>

    {modal?.kind === 'plan' && <Dialog title="Edit strategic plan" onClose={close}>
      <PlanForm plan={plan} institutions={institutions} onClose={close} onSaved={saved}/></Dialog>}
    {['create', 'edit', 'version'].includes(modal?.kind) && <Dialog title={modal.kind === 'create' ? 'Add objective' : modal.kind === 'edit' ? 'Edit objective' : 'New objective version'} onClose={close}>
      <ObjectiveForm mode={modal.kind} plan={plan} objective={modal.objective} onClose={close} onSaved={saved}/></Dialog>}
    {modal?.kind === 'history' && <Dialog title={`Objective ${modal.objective.code} — version history`} onClose={close}>
      <VersionHistory versions={modal.history} onClose={close}/></Dialog>}
  </>;
}

/* ------------------------------ Plan list ------------------------------ */
export default function StrategicPlans() {
  const {user} = useOutletContext();
  const [params, setParams] = useSearchParams();
  const planId = params.get('plan');
  const [institutions, setInstitutions] = useState([]);
  const ministryInstitution = institutions.find((item) => String(item.code).toUpperCase() === 'MIT');
  const access = useMemo(() => strategicPlanAccess(user, ministryInstitution?.id ?? null), [user, ministryInstitution?.id]);
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const ownInstitutionId = userInstitutionId(user);

  // Owner names/logos: ministry readers can list institutions; others use their own /me institution.
  useEffect(() => {
    if (!access.ministry) return undefined;
    let alive = true;
    listInstitutions({perPage: 100}).then((result) => { if (alive) setInstitutions(result.items); }).catch(() => {});
    return () => { alive = false; };
  }, [access.ministry]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listStrategicPlans({perPage: 100, ...(owner !== 'all' ? {institutionId: Number(owner)} : {})})
      .then((result) => { if (alive) { setPlans(result.items); setTotal(result.total); } })
      .catch((err) => { if (alive) { setPlans([]); setTotal(0); void Swal.fire({icon: 'error', title: 'Strategic plans not loaded', text: apiError(err)}); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [owner, revision]);

  const counts = useMemo(() => ({
    all: plans.length,
    active: plans.filter((plan) => plan.status === 'active').length,
    draft: plans.filter((plan) => plan.status !== 'active').length,
  }), [plans]);
  const yearsCovered = useMemo(() => new Set(plans.filter((p) => p.status === 'active').flatMap((p) => planFinancialYears(p.startDate, p.endDate))).size, [plans]);
  const shown = plans.filter((plan) => (status === 'all' || (status === 'active' ? plan.status === 'active' : plan.status !== 'active'))
    && (!query.trim() || String(plan.name).toLowerCase().includes(query.trim().toLowerCase())));
  // Owner choices for MOA: own (MIT) institution first, then the rest from GET /institutions.
  const ownerChoices = useMemo(() => {
    const own = user?.institution && ownInstitutionId != null ? [{...user.institution, id: ownInstitutionId}] : [];
    return [...own, ...institutions.filter((item) => String(item.id) !== String(ownInstitutionId))];
  }, [institutions, user, ownInstitutionId]);
  const ownerOptions = institutions.map((item) => ({value: String(item.id), label: item.code || item.name}));
  const openPlan = (id) => setParams(id ? {plan: String(id)} : {});

  async function activateFromList(plan) {
    const answer = await Swal.fire({icon: 'question', showCancelButton: true, confirmButtonText: 'Activate plan', title: `Activate “${plan.name}”?`,
      text: 'After activation the plan and its objectives are frozen. Changes are added as new objective versions.'});
    if (!answer.isConfirmed) return;
    try {
      const result = await activateStrategicPlan(plan.id);
      reload();
      void Swal.fire({icon: 'success', title: 'Plan activated', text: result.message || 'Objectives are now selectable.'});
    } catch (err) { void Swal.fire({icon: 'error', title: 'Plan not activated', text: apiError(err)}); }
  }

  if (planId) {
    return <main className="adm-modern sp-page container-fluid px-0">
      <PlanDetail planId={planId} access={access} institutions={institutions} user={user} onBack={() => openPlan(null)} onChanged={reload}/>
    </main>;
  }

  return <main className="adm-modern sp-page container-fluid px-0">
    <MuHeader initials="🎯" title="Strategic Plans" subtitle="Multi-year plans and objectives used to link datasets to performance">
      {access.canCreatePlan && <button type="button" className="mu-btn mu-btn-primary" onClick={() => setModal({kind: 'create'})}><Plus size={16}/> Create Strategic Plan</button>}
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<Target size={18}/>} title="Strategic plans" value={countText(loading ? null : total, 'plan', loading)} note={access.ministry ? 'in your scope' : 'your institution'} arrow={false} onOpen={() => setStatus('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(loading ? null : counts.active, 'plan', loading)} note="objectives selectable" arrow={false} onOpen={() => setStatus('active')}/>
      <MuKpi tone="amber" icon={<PencilLine size={18}/>} title="Draft" value={countText(loading ? null : counts.draft, 'plan', loading)} note="still being prepared" arrow={false} onOpen={() => setStatus('draft')}/>
      <MuKpi tone="indigo" icon={<CalendarRange size={18}/>} title="Years covered" value={countText(loading ? null : yearsCovered, 'year', loading)} note="by active plans" arrow={false}/>
    </div>
    <section className="adm-card">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Plans</h2><span className="mu-count">{loading ? '…' : shown.length}</span></header>
      <div className="adm-toolbar sp-toolbar">
        <MuTabs label="Plan status" value={status} onChange={setStatus}
          items={[{key: 'all', label: 'All', count: counts.all}, {key: 'active', label: 'Active', count: counts.active}, {key: 'draft', label: 'Draft', count: counts.draft}]}/>
        {access.ministry && ownerOptions.length > 0 && <MuSelect label="Institution" value={owner} onChange={setOwner} allLabel="All" options={ownerOptions}/>}
        <label className="vim-search-field"><Search size={16}/><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plan name…" aria-label="Search plans"/></label>
        <button type="button" className="mu-btn adm-icon-btn" onClick={reload} disabled={loading} title="Refresh" aria-label="Refresh"><RefreshCw size={15}/></button>
      </div>
      <div className="vim-table-scroll"><table className="table vim-table mb-0 sp-table"><thead><tr>
        <th>#</th><th>Strategic plan</th><th>Owner</th><th>Plan period</th><th>Status</th><th aria-label="Actions"/>
      </tr></thead><tbody>
        {shown.map((plan, index) => {
          const years = planFinancialYears(plan.startDate, plan.endDate);
          const manage = access.canManagePlan(plan) && plan.status !== 'active';
          return <tr key={plan.id}>
            <td>{index + 1}</td>
            <td><button type="button" className="sp-link" onClick={() => openPlan(plan.id)}>{plan.name}</button></td>
            <td><OwnerCell institutionId={plan.institutionId} institutions={institutions} user={user}/></td>
            <td><span className="mu-date">{fmtDate(plan.startDate)} → {fmtDate(plan.endDate)}<small>{years.length} reporting year{years.length === 1 ? '' : 's'}</small></span></td>
            <td><MuBadge tone={statusTone(plan)}>{statusLabel(plan)}</MuBadge></td>
            <td className="mu-actions"><RowActionsMenu label="Plan actions">
              <button type="button" title="Open plan" aria-label="Open plan" onClick={() => openPlan(plan.id)}><Eye size={15}/></button>
              {manage && <button type="button" title="Edit details" aria-label="Edit plan" onClick={() => setModal({kind: 'edit', plan})}><PencilLine size={15}/></button>}
              {manage && <button type="button" title="Activate" aria-label="Activate plan" onClick={() => activateFromList(plan)}><Zap size={15}/></button>}
            </RowActionsMenu></td>
          </tr>;
        })}
        {!loading && !shown.length && <tr><td colSpan={6} className="vim-empty">
          {plans.length ? 'No plans match these filters.' : access.canCreatePlan ? 'No strategic plans yet. Create the first plan to start linking datasets to objectives.' : 'No strategic plans yet.'}
        </td></tr>}
      </tbody></table><TableLoader active={loading}/></div>
      {total > plans.length && <p className="sp-help">Showing the first {plans.length} of {total} plans. Use the institution filter to narrow the list.</p>}
    </section>

    {modal && <Dialog title={modal.kind === 'create' ? 'Create strategic plan' : 'Edit strategic plan'} onClose={() => setModal(null)}>
      <PlanForm plan={modal.plan} institutions={ownerChoices} ownInstitutionId={ownInstitutionId}
        chooseOwner={access.roles.includes('MOA') && ownerChoices.length > 1}
        onClose={() => setModal(null)} onSaved={(created) => { setModal(null); reload(); if (created?.id && modal.kind === 'create') openPlan(created.id); }}/>
    </Dialog>}
  </main>;
}

