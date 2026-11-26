/**
 * FILE: src/pages/Reports/Reports.jsx
 * NAVIGATION FLOW: /dashboard/reports -> ProtectedRoute -> RouteAccess -> Reports (catalogue)
 *                  /dashboard/reports/:reportId -> back to this list (team build: report pages are not shipped yet)
 * DATA FLOW: catalogue from src/config/reportCatalogue.js; who may open which report from GET /reports/catalog
 * (Laravel reports.view.{slug}); the permission reading in reportAudience is only the fallback.
 * Linked to Laravel 8 Nov 2026: all reports are live. Titles are shown in Kiswahili with the English name below.
 */
import {useEffect, useMemo, useState} from 'react';
import {useOutletContext} from 'react-router-dom';
import {Briefcase, ClipboardList, FileBarChart2, LineChart, LockKeyhole} from 'lucide-react';
import {MuBadge, MuHeader, MuKpi, MuTabs} from '../../components/modern/ModernUI.jsx';
import {REPORT_GROUPS, REPORTS, reportAudience} from '../../config/reportCatalogue.js';
import {meReportsAPI} from '../../API/meReports.js';
import {ownOrg, plural} from '../../utils/roleDisplay.js';
import {useAnalyticsBreadcrumb} from '../Analytics/analyticsParts.jsx';
import {useLanguage} from '../../i18n/LanguageContext.jsx';
import './Reports.css';

/** Team build: the list shows every report and whether the role has it; the report pages themselves are not shipped yet. */
function ReportCard({report, allowed, lang, pick}) {
  return <div className={`rp-card rp-tone-${report.tone}${allowed ? '' : ' rp-locked'}`} aria-label={`${report.no}. ${report.title[lang]}`}>
    <span className="rp-card-top"><span className="rp-no">{report.no}</span><span className="rp-names"><b>{report.title[lang]}</b></span></span>
    <span className="rp-desc">{report.description[lang] ?? report.description.sw}</span>
    <span className="rp-foot">{allowed
      ? <MuBadge tone="grey">{pick('Report page in preparation', 'Ukurasa wa ripoti unaandaliwa')}</MuBadge>
      : <MuBadge tone="grey"><LockKeyhole size={11}/> {pick('Not in your role', 'Haipo kwenye jukumu lako')}</MuBadge>}</span>
  </div>;
}

export default function Reports() {
  const {user} = useOutletContext();
  useAnalyticsBreadcrumb([{text: 'Reports'}]);
  const {lang, pick} = useLanguage();
  const n = (count, en, sw) => (lang === 'sw' ? `${sw} ${count}` : plural(count, en));
  const [group, setGroup] = useState('all');
  const [allowedSlugs, setAllowedSlugs] = useState(null);
  useEffect(() => {
    let alive = true;
    meReportsAPI.catalog().then(list => { if (alive && Array.isArray(list)) setAllowedSlugs(new Set(list.map(r => r.slug))); }).catch(() => { /* fallback: permissions */ });
    return () => { alive = false; };
  }, []);
  const rows = useMemo(() => REPORTS.map(report => ({report, allowed: reportAudience(report, user, allowedSlugs)})), [user, allowedSlugs]);
  const allowed = rows.filter(r => r.allowed);
  const count = key => rows.filter(r => r.report.group === key && r.allowed).length;
  const shown = key => rows.filter(r => r.report.group === key && (group === 'all' || group === key));
  const org = user?.institution?.name ?? pick('Ministry of Industry and Trade', 'Wizara ya Viwanda na Biashara');
  return <div className="reports-page mu-page container-fluid px-0">
    <MuHeader logo={ownOrg(user).logo} initials="RPT" title={pick('Reports', 'Ripoti')} subtitle={`${pick('Published M&E data', 'Takwimu za U&T zilizochapishwa')} · ${org}`}/>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<FileBarChart2 size={19}/>} title={pick('Available to you', 'Unazoweza kufungua')} value={n(allowed.length, 'report', 'ripoti')} note={pick(`of ${REPORTS.length} in the catalogue`, `kati ya ${REPORTS.length} kwenye orodha`)} arrow={false} onOpen={() => setGroup('all')}/>
      <MuKpi tone="indigo" icon={<Briefcase size={18}/>} title={pick('Executive', 'Viongozi')} value={n(count('exec'), 'report', 'ripoti')} note={REPORT_GROUPS[0].note[lang]} arrow={false} onOpen={() => setGroup('exec')}/>
      <MuKpi tone="green" icon={<LineChart size={18}/>} title={pick('M&E performance', 'Ufuatiliaji na Tathmini')} value={n(count('me'), 'report', 'ripoti')} note={REPORT_GROUPS[1].note[lang]} arrow={false} onOpen={() => setGroup('me')}/>
      <MuKpi tone="amber" icon={<ClipboardList size={18}/>} title={pick('Operational', 'Kiutendaji')} value={n(count('ops'), 'report', 'ripoti')} note={REPORT_GROUPS[2].note[lang]} arrow={false} onOpen={() => setGroup('ops')}/>
    </div>
    <MuTabs label={pick('Report category', 'Kundi la ripoti')} value={group} onChange={setGroup} items={[{key: 'all', label: pick('All', 'Zote'), count: REPORTS.length},
      ...REPORT_GROUPS.map(g => ({key: g.key, label: g.title[lang].replace(/^[A-C]\. /, ''), count: rows.filter(r => r.report.group === g.key).length}))]}/>
    {REPORT_GROUPS.map(g => shown(g.key).length > 0 && <div key={g.key}>
      <div className="rp-group"><h2>{g.title[lang]}</h2><span>{g.note[lang]}</span></div>
      <div className={`rp-grid${g.key === 'exec' ? ' rp-grid-exec' : ''}`}>{shown(g.key).map(({report, allowed: ok}) => <ReportCard key={report.id} report={report} allowed={ok} lang={lang} pick={pick}/>)}</div>
    </div>)}
    <p className="mu-muted small mt-3 mb-0">{pick('The report pages are being prepared and will open from this list in a later release. Availability follows your role.', 'Kurasa za ripoti zinaandaliwa na zitafunguka kutoka orodha hii kwenye toleo lijalo. Upatikanaji unafuata jukumu lako.')}</p>
  </div>;
}
