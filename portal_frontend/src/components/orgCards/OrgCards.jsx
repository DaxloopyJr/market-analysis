/**
 * Approved organisation card UI (27 Oct 2026): round picture, Ministry colours,
 * smooth hover lift. Used by Institution Analytics and the MDO/MDD Review Queue.
 * React + Bootstrap + plain CSS only.
 */
import {useState} from 'react';
import {Building2,Check,ChevronRight,RefreshCw,Search} from 'lucide-react';
import {absorptionBand,formatTzs} from '../../utils/orgCards.js';
import '../modern/ModernUI.css';
import {MuWaitRing} from '../modern/ModernUI.jsx';
import './OrgCards.css';

export function OrgLogo({src,initials}){
  const [brokenSrc,setBrokenSrc]=useState('');
  const broken=!!src&&brokenSrc===src; // a new picture URL gets a fresh try
  const label=String(initials||'').slice(0,5);
  return <span className={`oc-logo${src&&!broken?'':' oc-logo-text'}${label.length>4?' oc-logo-sm':''}`} aria-hidden="true">
    {src&&!broken?<img src={src} alt="" loading="lazy" onError={()=>setBrokenSrc(src)}/>:(label||<Building2 size={18}/>)}
  </span>;
}

/** Panel header: title · Institutions/Departments switch · search · Financial Year · refresh. */
export function OrgPanel({title,type,onType,counts={},types=['institution','department'],labels={},search,onSearch,years=[],year,onYear,allYears=false,onRefresh,legend,children}){
  return <section className="oc-panel">
    <header className="oc-head">
      <h2><span className="oc-head-dot" aria-hidden="true"/>{title}</h2>
      <div className="oc-tools">
        {/* Scope (30 Oct 2026): a type the user has no organisations of is not offered (no "Department" for institution users). */}
        {types.length>1&&<div className="oc-switch" role="group" aria-label="Reporting source type">
          {[['institution',labels.institution||'Institutions'],['department',labels.department||'Departments & Units']].filter(([key])=>types.includes(key)).map(([key,label])=>
            <button type="button" key={key} className={type===key?'active':''} aria-pressed={type===key} onClick={()=>onType(key)}>
              {label}{Number.isFinite(counts[key])&&<b>{counts[key]}</b>}
            </button>)}
        </div>}
        <label className="oc-search"><Search size={15}/>
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder={type==='department'?'Search departments or units…':'Search institutions…'}/>
        </label>
        <label className="oc-year"><small>Financial Year</small>
          <select value={year} onChange={e=>onYear(e.target.value)}>
            {allYears&&<option value="all">All Years</option>}
            {years.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {onRefresh&&<button type="button" className="oc-round-btn" onClick={onRefresh} title="Refresh" aria-label="Refresh"><RefreshCw size={16}/></button>}
      </div>
    </header>
    {legend&&<div className="oc-legend">{legend.map(([band,label])=><span key={band} className={`oc-band-${band}`}><i/>{label}</span>)}</div>}
    {children}
  </section>;
}

function CardShell({band,onOpen,label,children,dim=false}){
  return <button type="button" className={`oc-card oc-band-${band}${dim?' oc-dim':''}`} onClick={onOpen} aria-label={label}>{children}</button>;
}
function CardHead({logo,initials,title,subtitle}){
  return <span className="oc-card-head"><OrgLogo src={logo} initials={initials}/>
    <span className="oc-card-name"><strong title={title}>{title}</strong>{subtitle&&<small title={subtitle}>{subtitle}</small>}</span>
  </span>;
}

/** MDO / MDD Review Queue card: total datasets + pending review. Red when anything is pending. */
export function ReviewOrgCard({logo,initials,title,subtitle,datasets=0,pending=0,onOpen}){
  const red=pending>0;
  return <CardShell band={red?'under':'excellence'} onOpen={onOpen} label={`${title}: ${datasets} datasets, ${pending} pending review`}>
    <CardHead logo={logo} initials={initials} title={title} subtitle={subtitle}/>
    <span className="oc-stats">
      <span className="oc-stat"><small>Datasets</small><b>{datasets}</b></span>
      <span className={`oc-stat ${red?'oc-stat-red':'oc-stat-green'}`}><small>Pending</small><b>{pending}</b></span>
    </span>
    <span className={`oc-foot ${red?'oc-foot-red':'oc-foot-green'}`}>
      <span>{red?`${pending} awaiting your review`:<>All reviewed <Check size={14}/></>}</span>
      <span className="oc-go"><ChevronRight size={15}/></span>
    </span>
  </CardShell>;
}

/** Institution Analytics card: budget absorption + approved/submitted + budget/spent. */
export function PerformanceOrgCard({logo,initials,title,subtitle,performance={},onOpen,yearNote='',dim=false}){
  const band=absorptionBand(performance.absorption);
  const hasCounts=performance.approved!==null&&performance.approved!==undefined||performance.submitted!==null&&performance.submitted!==undefined;
  const hasMoney=performance.budget!==null&&performance.budget!==undefined||performance.spent!==null&&performance.spent!==undefined;
  return <CardShell band={band.band} dim={dim} onOpen={onOpen} label={`${title}: budget absorption ${band.percent===null?'no data':band.percent+'%'}`}>
    <CardHead logo={logo} initials={initials} title={title} subtitle={subtitle}/>
    <span className="oc-abs"><span>Budget absorption</span><b>{band.percent===null?'':`${band.percent}%`}</b></span>
    <span className="oc-bar"><i style={{width:`${band.width}%`}}/></span>
    <span className="oc-band-label">{band.label}</span>
    <span className="oc-pills">
      {hasCounts?<>
        <span className="oc-pill oc-pill-green">{performance.approved??0} approved</span>
        <span className="oc-pill oc-pill-blue">{performance.submitted??0} submitted</span>
      </>:<span className="oc-pill oc-pill-blue">{performance.published??0} published dataset{performance.published===1?'':'s'}</span>}
      {Number.isFinite(performance.score)&&<span className="oc-pill oc-pill-green" title="M&E score from the organisation performance report">Score {Math.round(performance.score*10)/10}%</span>}
    </span>
    {yearNote&&<span className="oc-year-note">{yearNote}</span>}
    <span className="oc-money">
      {hasMoney?<>
        <span>Budget</span><b>{formatTzs(performance.budget)||'Not reported'}</b>
        <span>Spent</span><b className="oc-spent">{formatTzs(performance.spent)||'Not reported'}</b>
      </>:<><span>Budget</span><b className="oc-muted">Not reported</b></>}
    </span>
  </CardShell>;
}

export function OrgGrid({children,empty,loading}){
  const hasCards=Array.isArray(children)?children.flat().some(Boolean):Boolean(children);
  return <div className="oc-grid-host" aria-busy={loading||undefined}>
    <div className="oc-grid">{children}</div>
    {loading&&!hasCards&&<MuWaitRing height={180}/>}
    {!loading&&empty&&<div className="oc-empty">{empty}</div>}
  </div>;
}
