/**
 * FILE: src/pages/Reports/ReportView.jsx
 * ROUTE: /dashboard/reports/:reportId?year=&period=
 * Until a report's Laravel endpoint is linked (reportCatalogue status 'ready' + endpoint), the page shows the
 * approved layout frame: header, filters, export buttons (disabled) and what the report will contain.
 * No figures are invented.
 */
import {Navigate,useNavigate,useOutletContext,useParams,useSearchParams} from 'react-router-dom';
import {ArrowLeft,BarChart3,Clock3,Download,Printer,Table2} from 'lucide-react';
import {MuBadge,MuCard,MuHeader,MuSelect} from '../../components/modern/ModernUI.jsx';
import {REPORT_PERIODS,REPORT_STATUS,reportAudience,reportById} from '../../config/reportCatalogue.js';
import {currentFinancialYear,financialYearOptions} from '../../utils/orgCards.js';
import {useAnalyticsBreadcrumb} from '../Analytics/analyticsParts.jsx';
import './Reports.css';

export default function ReportView(){
  const {user}=useOutletContext();
  const {reportId}=useParams();
  const navigate=useNavigate();
  const [params,setParams]=useSearchParams();
  const report=reportById(reportId);
  useAnalyticsBreadcrumb([{text:'Reports',to:'/dashboard/reports'},{text:report?.title??'Report'}]);
  if(!report||!reportAudience(report,user))return <Navigate to="/dashboard/reports" replace/>;
  const year=params.get('year')||currentFinancialYear();
  const period=params.get('period')||'annual';
  const setFilter=(key,value)=>setParams(old=>{const next=new URLSearchParams(old);next.set(key,value);return next;},{replace:true});
  const status=REPORT_STATUS[report.status];
  const linked=report.status==='ready'&&report.endpoint;
  return <div className="reports-page mu-page container-fluid px-0">
    <MuHeader initials={String(report.no)} title={report.title} subtitle={`Report ${report.no} · published values only`}>
      <MuSelect label="Financial Year" value={year} options={financialYearOptions()} onChange={v=>setFilter('year',v)}/>
      <MuSelect label="Period" value={period} options={REPORT_PERIODS} onChange={v=>setFilter('period',v)}/>
      <button type="button" className="mu-btn" disabled={!linked} title={linked?'Download as Excel (CSV)':'Available when the report endpoint is linked'}><Download size={15}/> Excel (CSV)</button>
      <button type="button" className="mu-btn mu-btn-primary" disabled={!linked} title={linked?'Print or save as PDF':'Available when the report endpoint is linked'} onClick={()=>window.print()}><Printer size={15}/> Print / PDF</button>
    </MuHeader>
    <section className="mu-card rp-waiting">
      <span className="rp-waiting-icon"><Clock3 size={22}/></span>
      <div><h2>{report.status==='backend'?'Waiting for the Laravel report endpoint':'Report page is being linked'}</h2>
        <p>{report.status==='backend'
          ?`This report needs new data from Laravel${report.needs?`: ${report.needs}`:''}. It will appear here automatically once the endpoint is connected.`
          :'The published data for this report already exists. The figures, chart and table will appear here as soon as the report endpoint is connected.'}</p>
        <MuBadge tone={status.tone}>{status.label}</MuBadge> <span className="mu-muted small ms-2">FY {year} · {REPORT_PERIODS.find(p=>p.value===period)?.label}</span></div>
    </section>
    <div className="mu-grid-wide">
      <MuCard title="Table columns" tag="Table">
        <div className="rp-chips">{report.columns.map(column=><span key={column} className="rp-chip"><Table2 size={12}/> {column}</span>)}</div>
      </MuCard>
      <MuCard title="Charts & summary" tag="PPT format">
        {report.charts.length?<div className="rp-chips">{report.charts.map(chart=><span key={chart} className="rp-chip"><BarChart3 size={12}/> {chart}</span>)}</div>
          :<p className="mu-muted small mb-0">Table report (no chart).</p>}
        <p className="mu-muted small mt-2 mb-0">Charts use the M&amp;E report colours: Halisi (navy) dhidi ya Lengo (gold), with an Uchambuzi summary.</p>
      </MuCard>
    </div>
    <button type="button" className="mu-btn" onClick={()=>navigate('/dashboard/reports')}><ArrowLeft size={15}/> All reports</button>
  </div>;
}
