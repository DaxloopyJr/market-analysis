import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Submissions/Submissions.jsx
 * NAVIGATION FLOW: /dashboard/submissions/* -> ProtectedRoute -> RouteAccess -> Submissions
 * DATA / API FLOW: src/services/idoSubmissionService.jsx -> src/API/axios.jsx -> Laravel API.
 * NOTE: This reorganization changes imports/comments only, not page behavior.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, FilePlus2, ListChecks, Pencil, RotateCcw, Search } from "lucide-react";
import ModulePage from "../ModulePage/ModulePage";
import IconAction from "../../components/Workspace/IconAction";
import RowActionsMenu from "../../components/common/RowActionsMenu";
import PageSizeSelect from "../../components/common/PageSizeSelect.jsx";
import {usePageSize} from "../../components/common/usePageSize.js";
import {MuBadge,MuCard,MuDate,MuHeader,MuKpi,MuSelect,MuSkeleton,MuTabs} from "../../components/modern/ModernUI.jsx";
import {currentStepText,idoStatusGroup,ownOrg,plural,statusBadge} from "../../utils/roleDisplay.js";
import {cleanPeriod} from "../../utils/sourceIdentity.js";
import {reportingTime,reportingTimeOptions} from "../../utils/reportingTime.js";
import { getMySubmissions, loadSubmissionDetail } from "../../services/idoSubmissionService";
import { draftEditable } from "../../utils/submissionValues";
import "../Dashboard/Dashboard.css";
import "./Submissions.css";
import {OfficerSubmissionDetails} from "./OfficerSubmissionDetails.jsx";
import {TableLoader} from "../../components/common/LoadingState.jsx";
import SubmissionMonitor from "./SubmissionMonitor.jsx";
import {isMinistryAdmin} from "../../utils/submissionMonitor.js";

const VIEW_STATUS = {drafts: "Draft", returned: "Returned"};
const VIEWS = {
  my: "My Submissions",
  drafts: "Drafts",
  returned: "Returned for Correction",
  history: "Submission History",
};

/**
 * PAGE: pages/Submissions/Submissions.jsx (all IDO/DDO submissions views)
 * SERVICE: services/idoSubmissionService.jsx → getMySubmissions(user)
 * API EXAMPLE: GET /api/v1/submissions/my?status=&period=&search=
 * DETAILS: GET /api/v1/submissions/{id}, GET .../{id}/feedback
 * EDIT DRAFT/RETURNED: pages/DataEntry/DataEntry.jsx → saveDraft()
 * TODO(BACKEND): Complete Axios examples, status/period filters and expected
 * response JSON remain commented in idoSubmissionService.jsx. Frontend filtering
 * is only a preview; Laravel MUST enforce role and institution/department scope.
 */
function OfficerSubmissions({ view }) {
  const { user } = useOutletContext();
  const [queryParams, setQueryParams] = useSearchParams();
  const [submissions, setSubmissions] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(VIEW_STATUS[view] ?? "all");
  const [year, setYear] = useState("all");
  const [page, setPage] = useState(1);
  const [PAGE_SIZE, setPageSize] = usePageSize("ido-submissions", 10);
  const [period, setPeriod] = useState("all");
  const [error, setError] = useErrorDialogState("");
  const [loading, setLoading] = useState(true);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailError, setDetailError] = useErrorDialogState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getMySubmissions(user)
      .then((items) => {
        if (active) setSubmissions(items);
      })
      .catch((failure) => {
        if (active) setError(failure.message || "Could not load submissions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [user, view]);

  const totals = useMemo(() => {
    const by = {all: submissions.length, Draft: 0, Submitted: 0, Returned: 0, Published: 0};
    submissions.forEach((item) => { by[idoStatusGroup(item.status)] += 1; });
    return by;
  }, [submissions]);
  const yearOf = (item) => reportingTime(item).year;
  const years = useMemo(() => [...new Set(submissions.map(yearOf).filter(Boolean))].sort().reverse(), [submissions]);

  const visible = useMemo(() => submissions.filter((item) => {
    if (status !== "all" && idoStatusGroup(item.status) !== status) return false;
    if (year !== "all" && yearOf(item) !== year) return false;
    if (period !== "all" && reportingTime(item).period !== period) return false;
    const term = search.trim().toLowerCase();
    return !term || [item.dataset, item.period, item.status, item.id]
      .join(" ").toLowerCase().includes(term);
  }), [submissions, search, status, year, period]);

  const periods = useMemo(() => reportingTimeOptions(submissions, {year, frequency: "all"}).periods, [submissions, year]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const org = ownOrg(user);
  const plain = (value) => (loading ? "…" : value);

  const detailId=queryParams.get('detail');
  const detail = submissions.find((item) => String(item.id) === String(detailId)) || null;
  useEffect(()=>{
    if(!detailId){setDetailRecord(null);setDetailError('');return undefined;}
    let active=true;
    setDetailRecord(null);setDetailError('');
    loadSubmissionDetail(user,detailId).then(enriched=>{
      if(active)setDetailRecord(enriched);
    })
      .catch(err=>{if(active)setDetailError(err?.message || 'Could not load submission details.');});
    return ()=>{active=false;};
  },[detailId,user]);
  const setDetail = (id) => setQueryParams((previous) => {
    const next = new URLSearchParams(previous);
    if (id) next.set("detail", id);
    else next.delete("detail");
    return next;
  });

  const tabs = [
    {key: "all", label: "All", count: totals.all},
    {key: "Draft", label: "Drafts", count: totals.Draft},
    {key: "Submitted", label: "In progress", count: totals.Submitted},
    {key: "Returned", label: "Returned", count: totals.Returned},
    {key: "Published", label: "Published", count: totals.Published},
  ];
  const pick = (key) => { setStatus(key); setPage(1); };
  // Details open as a full page (approved 28 Oct 2026); ?detail=id keeps the link shareable, Back returns to the list.
  if (detailId && (detail || loading)) {
    return <div className="ido-page ido-submissions-page mu-page container-fluid px-0">
      {detail ? <OfficerSubmissionDetails org={org}
        record={detailRecord ? {...detail, ...detailRecord, dataset: detailRecord.dataset || detail.dataset, period: detailRecord.period || detail.period} : detail}
        loading={Boolean(detailId && !detailRecord && !detailError)}
        error={detailError}
        onClose={() => setDetail(null)}
      /> : <section className="mu-card"><MuSkeleton kind="list" rows={8} label="Loading submission details…"/></section>}
    </div>;
  }
  return (
    <div className="ido-page ido-submissions-page mu-page container-fluid px-0">
      <MuHeader logo={org.logo} initials={org.initials || "IDO"} title={VIEWS[view] || VIEWS.my} subtitle={org.name}>
        <MuSelect label="Reporting Year" value={year} allLabel="All years" options={years} onChange={(v) => { setYear(v); setPeriod("all"); setPage(1); }} />
        <MuSelect label="Reporting Period" value={period} allLabel="All periods" options={periods} onChange={(v) => { setPeriod(v); setPage(1); }} />
        <Link to="/dashboard/submissions/new" className="mu-btn mu-btn-primary"><FilePlus2 size={16} aria-hidden="true" /> New Submission</Link>
      </MuHeader>

      <div className="mu-kpis">
        <MuKpi tone="blue" icon={<ListChecks size={19} />} title="All" value={plain(plural(totals.all, "submission"))} note="this account" arrow={false} onOpen={() => pick("all")} />
        <MuKpi tone="amber" icon={<Pencil size={18} />} title="Drafts" value={plain(plural(totals.Draft, "draft"))} note="continue editing" arrow={false} onOpen={() => pick("Draft")} />
        <MuKpi tone="red" icon={<RotateCcw size={19} />} title="Returned" value={plain(plural(totals.Returned, "submission"))} note="fix and resubmit" arrow={false} onOpen={() => pick("Returned")} />
        <MuKpi tone="green" icon={<CheckCircle2 size={20} />} title="Published" value={plain(plural(totals.Published, "submission"))} note="final" arrow={false} onOpen={() => pick("Published")} />
      </div>

      <MuCard title="Submission records" count={loading ? "…" : visible.length}>
        <div className="mu-toolbar">
          <MuTabs label="Submission status filters" value={status} onChange={pick} items={tabs} />
          <label className="mu-search" style={{maxWidth: 320, marginLeft: "auto"}}><Search size={16} aria-hidden="true" />
            <input aria-label="Search submissions" placeholder="Search dataset or reference" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        </div>
        {error && !loading ? (
          <div className="mu-empty" role="alert">Unable to load submissions. Please try again.</div>
        ) : (
          <div className="mu-table-wrap vw-local-table-loading-host" aria-busy={loading}>
            <table className="mu-table">
              <thead><tr><th>#</th><th>Dataset</th><th>Reference</th><th>Reporting Period</th><th>Updated</th><th>Current step</th><th>Status</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {shown.map((item, index) => {
                  const badge = statusBadge(idoStatusGroup(item.status) === "Returned" ? "returned" : item.status);
                  return <tr key={item.id}>
                    <td>{(current - 1) * PAGE_SIZE + index + 1}</td>
                    <td><strong>{item.dataset}</strong></td>
                    <td>SUB-{item.id}</td>
                    <td>{reportingTime(item).period || cleanPeriod(item.period) || "—"}</td>
                    <td><MuDate value={item.updated_at} /></td>
                    <td>{currentStepText(item)}</td>
                    <td><MuBadge tone={badge.tone}>{badge.label}</MuBadge></td>
                    <td className="mu-actions"><RowActionsMenu label={`Submission actions for ${item.dataset}`}>
                      <IconAction icon={Eye} label={`View ${item.dataset} details`} onClick={() => setDetail(item.id)} />
                      {draftEditable(item.status) && (
                        <IconAction icon={Pencil} tone="edit" label={`${idoStatusGroup(item.status) === "Returned" ? "Correct" : "Edit draft"}: ${item.dataset}`}
                          to={`/dashboard/submissions/new?edit=${encodeURIComponent(item.id)}`} />
                      )}
                    </RowActionsMenu></td>
                  </tr>;
                })}
                {!loading && !shown.length && <tr><td colSpan={8} className="mu-empty">No submissions match these filters.</td></tr>}
                {loading && <tr><td colSpan={8} style={{height: 130}}>&nbsp;</td></tr>}
              </tbody>
            </table>
            <TableLoader active={loading} label="Loading submissions…" />
          </div>
        )}
        {!loading && <div className="mu-table-foot"><span>Showing {shown.length} of {visible.length}</span>
          <span className="vw-table-footer-tools"><PageSizeSelect value={PAGE_SIZE} onChange={(v) => { setPageSize(v); setPage(1); }} />{pages > 1 && <div className="mu-pager"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">‹</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">›</button></div>}</span></div>}
      </MuCard>

    </div>
  );
}

/** Non-data-officer roles keep the existing permission-aware ModulePage placeholder. */
export default function Submissions({ view = "my" }) {
  const { user } = useOutletContext();
  // Ministry admin: read-only monitoring of every submission (10 Nov 2026); no approval actions.
  if (view === "monitor" && isMinistryAdmin(user)) return <SubmissionMonitor user={user} />;
  if (!["IDO", "DDO"].includes(user?.role_code)) {
    return <ModulePage moduleId="submissions" />;
  }
  return <OfficerSubmissions view={view} />;
}
