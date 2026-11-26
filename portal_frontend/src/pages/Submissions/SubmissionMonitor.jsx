/**
 * FILE: src/pages/Submissions/SubmissionMonitor.jsx
 * Ufuatiliaji wa Uwasilishaji (10 Nov 2026): read-only monitoring for the Ministry admin (MOA).
 * Where every submission is, which role holds it, for how many working days, and its deadline.
 * Uses only existing Laravel reads: GET /submissions (with history), /datasets, /institutions, /users.
 * MOA does not approve, return, edit or publish here; reminders, reassignment and extensions need new
 * backend endpoints and are intentionally not offered.
 */
import {useEffect, useMemo, useState} from 'react';
import {useSearchParams, useNavigate} from 'react-router-dom';
import {AlertTriangle, CheckCircle2, Clock3, Download, Eye, ListChecks, ScrollText, Search} from 'lucide-react';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import IconAction from '../../components/Workspace/IconAction';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {MuBadge, MuCard, MuHeader, MuKpi, MuSelect, MuSkeleton} from '../../components/modern/ModernUI.jsx';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {useLanguage} from '../../i18n/LanguageContext.jsx';
import {useErrorDialogState} from '../../utils/userFacingErrors.js';
import {downloadXlsx} from '../../utils/xlsx.js';
import {allSubmissionRows} from '../../services/submissionReadService.js';
import {cached, fetchAllPages} from '../../services/listCache.js';
import {datasetsAPI} from '../../API/dataset.jsx';
import {listInstitutions} from '../../API/institution.jsx';
import {listUsers} from '../../API/users.jsx';
import {loadSubmissionDetail} from '../../services/idoSubmissionService';
import {OfficerSubmissionDetails} from './OfficerSubmissionDetails.jsx';
import {ROLE_NAMES, STUCK_WORKING_DAYS, monitorRow} from '../../utils/submissionMonitor.js';
import './SubmissionMonitor.css';

const reference = (key, request) => cached(key, async () => (await fetchAllPages(request)).items, 300_000);

/** Users by id with their role codes; when the list is refused, holders are shown by role only. */
const loadPeople = () => reference('users:monitor', params => listUsers({...params, perPage: 100})).then(rows => new Map(rows.map(u => [String(u.id), {
  name: u.name, institutionId: u.institution_id ?? u.institutionId ?? u.institution?.id, active: u.is_active !== false && u.status !== 'inactive',
  roles: (u.roles ?? []).map(r => String(typeof r === 'string' ? r : r.code).toUpperCase()),
}]))).catch(() => new Map());

export default function SubmissionMonitor({user}) {
  const {pick} = useLanguage();
  const P = ([en, sw]) => pick(en, sw);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorDialogState('');
  const [period, setPeriod] = useState('');
  const [institution, setInstitution] = useState('all');
  const [stage, setStage] = useState('all');
  const [only, setOnly] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = usePageSize('moa-monitor', 20);

  useEffect(() => {
    let alive = true;
    Promise.all([allSubmissionRows(), reference('datasets:all', p => datasetsAPI.list(p)), reference('institutions:all', listInstitutions), loadPeople()])
      .then(([subs, ds, inst, people]) => {
        if (!alive) return;
        const lookups = {datasets: new Map(ds.map(d => [String(d.id), d])), institutions: new Map(inst.map(i => [String(i.id), i])), people};
        const built = subs.map(raw => monitorRow(raw, lookups)).filter(r => r.id != null);
        setRows(built);
        setPeriod(current => current || [...built].sort((a, b) => b.periodId - a.periodId)[0]?.period || 'all');
      })
      .catch(failure => { if (alive) setError(failure?.message || 'Could not load submissions.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [setError]);

  const periods = useMemo(() => [...new Map([...rows].sort((a, b) => b.periodId - a.periodId).map(r => [r.period, r.period])).keys()].filter(Boolean), [rows]);
  const inPeriod = useMemo(() => rows.filter(r => (period === 'all' || !period || r.period === period) && (institution === 'all' || r.institutionId === institution)), [rows, period, institution]);
  const institutionOptions = useMemo(() => [...new Map(rows.map(r => [r.institutionId, r.institutionName || r.institution])).entries()]
    .filter(([id]) => id).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({value, label})), [rows]);
  const kpi = useMemo(() => {
    const review = inPeriod.filter(r => r.stage === 'review');
    const by = review.reduce((acc, r) => ({...acc, [r.role || '—']: (acc[r.role || '—'] ?? 0) + 1}), {});
    return {total: inPeriod.length, review: review.length, by, stuck: inPeriod.filter(r => r.stuck).length, late: inPeriod.filter(r => r.late).length,
      done: inPeriod.filter(r => r.stage === 'done').length};
  }, [inPeriod]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inPeriod.filter(r => (stage === 'all' || (stage === 'done' ? r.stage === 'done' : stage === 'IDO' ? ['draft', 'returned'].includes(r.stage) : r.role === stage))
      && (!only || (only === 'stuck' ? r.stuck : r.late))
      && (!term || [r.reference, r.dataset, r.institution, r.institutionName, r.holders.join(' ')].join(' ').toLowerCase().includes(term)))
      .sort((a, b) => Number(b.stuck) - Number(a.stuck) || Number(b.late) - Number(a.late) || (b.days ?? -1) - (a.days ?? -1));
  }, [inPeriod, stage, only, search]);
  const pages = Math.max(1, Math.ceil(visible.length / size));
  const current = Math.min(page, pages);
  const shown = visible.slice((current - 1) * size, current * size);
  const toggle = key => { setOnly(value => (value === key ? '' : key)); setPage(1); };

  const statusText = r => ({done: P(['Published', 'Imechapishwa']), draft: P(['Draft', 'Rasimu']), returned: P(['Returned', 'Imerudishwa'])}[r.stage]
    ?? (r.status === 'approved' ? P(['Approved', 'Imeidhinishwa']) : P(['In review', 'Inapitiwa'])));
  const statusTone = r => ({done: 'green', draft: 'grey', returned: 'amber'}[r.stage] ?? 'blue');
  const whereText = r => r.stage === 'done' ? P(['Completed', 'Imekamilika'])
    : r.stage === 'returned' ? P(['With Data Officer (correction)', 'Kwa Afisa Takwimu (marekebisho)'])
      : r.stage === 'draft' ? P(['With Data Officer (draft)', 'Kwa Afisa Takwimu (rasimu)'])
        : `${P(['With', 'Kwa'])} ${pick(...(ROLE_NAMES[r.role] ?? [r.role || '—', r.role || '—']))}`;
  const deadlineText = ({deadline: d}) => ({overdue: P([`Overdue by ${d.days} day${d.days === 1 ? '' : 's'}`, `Imepita siku ${d.days}`]),
    soon: d.days === 0 ? P(['Due today', 'Inaisha leo']) : P([`Due in ${d.days} day${d.days === 1 ? '' : 's'}`, `Inaisha baada ya siku ${d.days}`]),
    ok: P(['Within deadline', 'Ndani ya muda']), late: P([`Submitted ${d.days} day${d.days === 1 ? '' : 's'} late`, `Iliwasilishwa siku ${d.days} baada ya muda`]),
    ontime: P(['Submitted on time', 'Iliwasilishwa kwa wakati'])}[d.key] ?? '—');
  const holderText = r => (r.holders.length ? (r.holders.length > 2 ? `${r.holders.slice(0, 2).join(', ')} +${r.holders.length - 2}` : r.holders.join(', ')) : '—');

  const exportExcel = () => downloadXlsx([{name: 'Ufuatiliaji', title: `${P(['Submission Monitoring', 'Ufuatiliaji wa Uwasilishaji'])} · ${period === 'all' ? P(['All periods', 'Vipindi vyote']) : period}`,
    notes: [`${P(['Stuck', 'Zilizokwama'])} = ${STUCK_WORKING_DAYS}+ ${P(['working days at one step', 'siku za kazi kwenye hatua moja'])}`],
    columns: [P(['Reference', 'Namba']), P(['Institution', 'Taasisi']), P(['Dataset', 'Seti ya Data']), P(['Period', 'Kipindi']), P(['Status', 'Hali']),
      P(['Where now', 'Ilipo sasa']), P(['Held by', 'Anashikilia']), P(['Working days at step', 'Siku za kazi kwenye hatua']), P(['Deadline', 'Tarehe ya mwisho']), P(['Deadline status', 'Hali ya muda'])],
    rows: visible.map(r => [r.reference, r.institutionName || r.institution, r.dataset, r.period, statusText(r), whereText(r), r.holders.join(', '), r.days ?? '', r.due ?? '', deadlineText(r)]),
  }], `ufuatiliaji-uwasilishaji-${new Date().toISOString().slice(0, 10)}.xlsx`);

  // Read-only details reuse the officer detail view (data, remarks, approval history).
  const detailId = params.get('detail');
  const [loaded, setLoaded] = useState({id: null, record: null});
  const detail = loaded.id === detailId ? loaded.record : null;
  const [detailError, setDetailError] = useErrorDialogState('');
  useEffect(() => {
    if (!detailId) return undefined;
    let alive = true;
    loadSubmissionDetail(user, detailId).then(record => { if (alive) setLoaded({id: detailId, record}); })
      .catch(failure => { if (alive) setDetailError(failure?.message || 'Could not load submission details.'); });
    return () => { alive = false; };
  }, [detailId, user, setDetailError]);
  const openDetail = id => setParams(prev => { const next = new URLSearchParams(prev); if (id) next.set('detail', id); else next.delete('detail'); return next; });
  if (detailId) {
    const row = rows.find(r => String(r.id) === String(detailId));
    return <div className="ido-page mu-page container-fluid px-0">
      {detail ? <OfficerSubmissionDetails org={{name: row?.institutionName || detail.institution_name || '', initials: row?.institution || ''}}
        record={{...detail, dataset: detail.dataset || row?.dataset, period: detail.period || row?.period}} loading={false} error={detailError} onClose={() => openDetail(null)}/>
        : <section className="mu-card"><MuSkeleton kind="list" rows={8} label={P(['Loading submission details…', 'Inapakia maelezo ya uwasilishaji…'])}/></section>}
    </div>;
  }

  const plain = v => (loading ? '…' : v);
  const by = Object.entries(kpi.by).map(([role, n]) => `${role} ${n}`).join(' · ');
  return <div className="mu-page container-fluid px-0 smon-page">
    <MuHeader initials="MIT" title={P(['Submission Monitoring', 'Ufuatiliaji wa Uwasilishaji'])}
      subtitle={P(['Where each submission is, who holds it and for how long. Read only: approvals stay with the workflow roles.',
        'Kila uwasilishaji ulipo, nani anaushikilia na kwa muda gani. Kusoma tu: uidhinishaji unabaki kwa wahusika wa mtiririko.'])}>
      <MuSelect label={P(['Reporting Period', 'Kipindi'])} value={period || 'all'} allLabel={P(['All periods', 'Vipindi vyote'])} options={periods} onChange={v => { setPeriod(v); setPage(1); }}/>
      <button type="button" className="mu-btn" onClick={exportExcel} disabled={loading || !visible.length}><Download size={16} aria-hidden="true"/> {P(['Download Excel', 'Pakua Excel'])}</button>
    </MuHeader>

    <div className="mu-kpis smon-kpis">
      <MuKpi tone="blue" icon={<ListChecks size={19}/>} title={P(['Submissions', 'Uwasilishaji'])} value={plain(kpi.total)} note={period === 'all' ? P(['all periods', 'vipindi vyote']) : period} arrow={false} onOpen={() => { setOnly(''); setStage('all'); }}/>
      <MuKpi tone="blue" icon={<Clock3 size={19}/>} title={P(['In review', 'Zinapitiwa'])} value={plain(kpi.review)} note={by || '—'} arrow={false} onOpen={() => { setOnly(''); setStage('all'); }}/>
      <MuKpi tone="red" icon={<AlertTriangle size={19}/>} title={P(['Stuck', 'Zilizokwama'])} value={plain(kpi.stuck)} note={P([`${STUCK_WORKING_DAYS}+ working days at one step`, `siku ${STUCK_WORKING_DAYS}+ za kazi kwenye hatua moja`])} arrow={false} onOpen={() => toggle('stuck')}/>
      <MuKpi tone="amber" icon={<Clock3 size={19}/>} title={P(['Overdue', 'Zilizochelewa'])} value={plain(kpi.late)} note={P(['not submitted, deadline passed', 'hazijawasilishwa, muda umepita'])} arrow={false} onOpen={() => toggle('late')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={20}/>} title={P(['Published', 'Zimechapishwa'])} value={plain(kpi.done)} note={kpi.total ? `${Math.round((kpi.done / kpi.total) * 100)}%` : '—'} arrow={false} onOpen={() => { setOnly(''); setStage('done'); }}/>
    </div>

    <MuCard title={P(['Submission tracker', 'Jedwali la ufuatiliaji'])} count={loading ? '…' : visible.length}>
      <div className="mu-toolbar smon-toolbar">
        <label className="mu-search"><Search size={16} aria-hidden="true"/>
          <input aria-label={P(['Search submissions', 'Tafuta uwasilishaji'])} placeholder={P(['Search institution, dataset, reference or person', 'Tafuta taasisi, dataset, namba au mtu'])} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></label>
        <MuSelect label={P(['Institution', 'Taasisi'])} value={institution} allLabel={P(['All', 'Zote'])} options={institutionOptions} onChange={v => { setInstitution(v); setPage(1); }}/>
        <MuSelect label={P(['Step', 'Hatua'])} value={stage} allLabel={P(['All', 'Zote'])} onChange={v => { setStage(v); setPage(1); }}
          options={[{value: 'IDO', label: P(['Data Officer', 'Afisa Takwimu'])}, {value: 'IHOD', label: 'IHOD'}, {value: 'AO', label: 'AO'}, {value: 'MDO', label: 'MDO'}, {value: 'MDD', label: 'MDD'}, {value: 'done', label: P(['Completed', 'Imekamilika'])}]}/>
        <div className="smon-chips" role="group" aria-label={P(['Quick filters', 'Vichujio vya haraka'])}>
          <button type="button" className={only === 'stuck' ? 'on' : ''} aria-pressed={only === 'stuck'} onClick={() => toggle('stuck')}>{P(['Stuck', 'Zilizokwama'])}</button>
          <button type="button" className={only === 'late' ? 'on' : ''} aria-pressed={only === 'late'} onClick={() => toggle('late')}>{P(['Overdue', 'Zilizochelewa'])}</button>
        </div>
      </div>
      {error && !loading ? <div className="mu-empty" role="alert">{P(['Unable to load submissions. Please try again.', 'Imeshindwa kupakia uwasilishaji. Tafadhali jaribu tena.'])}</div> :
        <div className="mu-table-wrap vw-local-table-loading-host" aria-busy={loading}>
          <table className="mu-table smon-table">
            <thead><tr><th>{P(['Reference / Period', 'Namba / Kipindi'])}</th><th>{P(['Institution / Dataset', 'Taasisi / Dataset'])}</th><th>{P(['Status', 'Hali'])}</th>
              <th>{P(['Where now / Held by', 'Ilipo sasa / Anashikilia'])}</th><th>{P(['Days at step', 'Siku kwenye hatua'])}</th><th>{P(['Deadline', 'Tarehe ya mwisho'])}</th><th aria-label={P(['Actions', 'Vitendo'])}/></tr></thead>
            <tbody>
              {shown.map(r => <tr key={r.id} className={r.stuck ? 'smon-stuck' : ''}>
                <td><b>{r.reference}</b><small>{r.period || '—'}</small></td>
                <td><b>{r.institution}</b><small title={r.dataset}>{r.dataset}</small></td>
                <td><MuBadge tone={statusTone(r)}>{statusText(r)}</MuBadge></td>
                <td><b>{whereText(r)}</b><small title={r.holders.join(', ')}>{holderText(r)}</small></td>
                <td>{r.days == null ? '—' : <span className={`smon-days ${r.stuck ? 'bad' : r.days >= 3 ? 'mid' : 'ok'}`}>{P([`${r.days} day${r.days === 1 ? '' : 's'}`, `siku ${r.days}`])}</span>}</td>
                <td><span className={`smon-dl ${r.deadline.tone}`}>{deadlineText(r)}</span></td>
                <td className="mu-actions"><RowActionsMenu label={`${P(['Actions for', 'Vitendo vya'])} ${r.reference}`}>
                  <IconAction icon={Eye} label={P(['View (read only)', 'Angalia (kusoma tu)'])} onClick={() => openDetail(r.id)}/>
                  <IconAction icon={ScrollText} label={P(['Audit trail', 'Kumbukumbu za ukaguzi'])} onClick={() => navigate(`/dashboard/audit-logs?entityType=submission&entityId=${r.id}`)}/>
                </RowActionsMenu></td>
              </tr>)}
              {!loading && !shown.length && <tr><td colSpan={7} className="mu-empty">{P(['No submissions match these filters.', 'Hakuna uwasilishaji unaolingana na vichujio hivi.'])}</td></tr>}
              {loading && <tr><td colSpan={7} style={{height: 130}}>&nbsp;</td></tr>}
            </tbody>
          </table>
          <TableLoader active={loading} label={P(['Loading submissions…', 'Inapakia uwasilishaji…'])}/>
        </div>}
      {!loading && <div className="mu-table-foot"><span>{P([`Showing ${shown.length} of ${visible.length}`, `Inaonyesha ${shown.length} kati ya ${visible.length}`])}</span>
        <span className="vw-table-footer-tools"><PageSizeSelect value={size} onChange={v => { setSize(v); setPage(1); }}/>{pages > 1 && <div className="mu-pager"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">‹</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">›</button></div>}</span></div>}
    </MuCard>
    <p className="smon-note">{P([`Red bar = stuck (${STUCK_WORKING_DAYS}+ working days at one step). For roles, the names shown are everyone holding that role in the institution.`,
      `Kistari chekundu = umekwama (siku ${STUCK_WORKING_DAYS}+ za kazi kwenye hatua moja). Kwa majukumu, majina ni ya wote wenye jukumu hilo kwenye taasisi.`])}</p>
  </div>;
}
