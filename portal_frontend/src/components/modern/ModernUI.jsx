/**
 * Shared "modern" building blocks (approved 28 Oct 2026) so older pages match the new
 * Analytics / Review Queue look: round icons, modest numbers, labelled selects, dot headers,
 * soft badges, round logos and smooth hover lift. React + Bootstrap + plain CSS only.
 */
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronRight} from 'lucide-react';
import './ModernUI.css';

export function MuRing({percent,color='#0b5bd3',size=44,stroke=6,text}){
  const r=(size-stroke)/2,c=2*Math.PI*r,known=percent!==null&&percent!==undefined,p=Math.max(0,Math.min(100,Number(percent)||0));
  return <svg width={size} height={size} aria-hidden="true" className="mu-ring">
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#eef1f6" strokeWidth={stroke}/>
    {known&&<circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={`${(c*p)/100} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>}
    {text!==undefined&&<text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={isPending(text)||text==='—'?'#c3ccda':'#0a2a5c'}>{isPending(text)?'—':text}</text>}
  </svg>;
}

/* ---------- Loading skeletons (29 Oct 2026) ----------
 * Shimmer placeholders shown WHILE Laravel data is loading, so cards/charts never look empty
 * or claim "No records". Pages keep their "…" convention: MuKpi/MuCard turn "…" into a shimmer. */
const isPending = value => value === '…' || value === '...';
/**
 * Loading style F (9 Nov 2026): no grey skeleton blocks. A value that is still loading shows a soft "—";
 * a card or table that is still loading shows one small navy ring. Pages that were seen before keep their
 * last data instead (hooks/useRemembered.js + the .mu-refreshing class).
 */
export function MuSkel({className=''}){
  return <span className={`mu-wait-dash ${className}`} aria-hidden="true">—</span>;
}
export function MuWaitRing({height=150,label='Loading…'}){
  return <div className="mu-wait" style={{minHeight:height}} role="status" aria-live="polite" aria-label={label}><span className="mu-wait-ring" aria-hidden="true"/><span className="mu-wait-label">{label}</span></div>;
}
/** Chart / list placeholder (kind and rows are kept for the existing callers). */
export function MuSkeleton({height=170,kind,rows,label='Loading…'}){
  const size = kind==='lines'||kind==='list' ? Math.max(90,(rows||4)*30) : kind==='donut' ? 150 : height;
  return <MuWaitRing height={size} label={label}/>;
}
/** Table placeholder: one row with the ring, inside <tbody> while loading. */
export function MuSkeletonRows({cols=4,rows=4}){
  return <tr className="mu-wait-row"><td colSpan={cols}><MuWaitRing height={Math.min(160,Math.max(90,rows*28))}/></td></tr>;
}

/** KPI card: round icon (or ring) + small title + modest value + note; hover lift. */
export function MuKpi({icon,tone='blue',title,value,note,onOpen,arrow=true,loading=false}){
  const pending = loading || isPending(value);
  const body=<>
    <span className="mu-kpi-icon">{icon}</span>
    <span className="mu-kpi-text"><small>{title}</small><b>{pending?<MuSkel/>:value}</b>{note&&<span>{note}</span>}</span>
  </>;
  // A card that only shows a number is not a button (8 Nov 2026): it keeps the hover lift, no click.
  if(typeof onOpen!=='function')return <div className={`mu-kpi mu-tone-${tone} is-static${pending?' is-loading':''}`} aria-busy={pending||undefined}>{body}</div>;
  return <button type="button" className={`mu-kpi mu-tone-${tone}${pending?' is-loading':''}`} onClick={onOpen} aria-busy={pending||undefined}>
    {body}
    {arrow&&<span className="mu-kpi-arrow"><ChevronRight size={14}/></span>}
  </button>;
}

/** Select with its label above the value (Financial Year style). options: strings or {value,label}. */
export function MuSelect({label,value,onChange,options,allLabel}){
  return <label className="mu-select"><small>{label}</small>
    <select value={value} onChange={e=>onChange(e.target.value)}>
      {allLabel&&<option value="all">{allLabel}</option>}
      {options.map(option=>typeof option==='object'
        ?<option key={option.value} value={option.value}>{option.label}</option>
        :<option key={option} value={option}>{option}</option>)}
    </select>
  </label>;
}

/** White card with a dot header, optional count and a right-side action (link or tag). */
export function MuCard({title,count,action,actionTo,tag,children,className='',onClick}){
  return <section className={`mu-card ${className}`} onClick={onClick}>
    <header className="mu-card-head"><span className="mu-dot" aria-hidden="true"/><h2>{title}</h2>
      {count!==undefined&&count!==null&&(isPending(count)?<span className="mu-count mu-count-wait"><MuSkel/></span>:<span className="mu-count">{count}</span>)}
      {actionTo?<Link to={actionTo} className="mu-card-action" onClick={e=>e.stopPropagation()}>{action??'View all'} ›</Link>:tag?<span className="mu-card-tag">{tag}</span>:null}
    </header>
    {children}
  </section>;
}

/** Round logo (API picture) or initials. */
export function MuLogo({src,initials,size=30}){
  const [brokenSrc,setBrokenSrc]=useState('');
  const broken=!!src&&brokenSrc===src; // a new picture URL gets a fresh try
  const text=String(initials||'').slice(0,5);
  return <span className={`mu-logo${src&&!broken?'':' mu-logo-text'}`} style={{width:size,height:size,fontSize:text.length>3?9:10}} aria-hidden="true">
    {src&&!broken?<img src={src} alt="" loading="lazy" onError={()=>setBrokenSrc(src)}/>:text}
  </span>;
}

/** Table cell: logo + short code + full name. */
export function MuSource({logo,initials,code,name}){
  return <span className="mu-source"><MuLogo src={logo} initials={initials}/>
    <span className="mu-source-text"><b>{code||name}</b>{name&&name!==code&&<small title={name}>{name}</small>}</span></span>;
}

export const MuBadge=({tone='amber',children})=><span className={`mu-badge mu-badge-${tone}`}>{children}</span>;

/** Two-line date: "20 Oct 2026" + "10:15" (Africa/Dar_es_Salaam). */
export function MuDate({value}){
  const n=Date.parse(value||'');
  if(!Number.isFinite(n))return <span className="mu-muted">—</span>;
  const d=new Date(n),tz='Africa/Dar_es_Salaam';
  return <span className="mu-date">{d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:tz})}
    <small>{d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz})}</small></span>;
}

/** Card-style link with coloured edge, round icon and arrow. */
export function MuLinkCard({to,icon,title,note,tone='blue'}){
  return <Link to={to} className={`mu-linkcard mu-tone-${tone}`}><span className="mu-kpi-icon">{icon}</span>
    <span className="mu-kpi-text"><b className="mu-linkcard-title">{title}</b><span>{note}</span></span>
    <span className="mu-kpi-arrow"><ChevronRight size={14}/></span></Link>;
}

/** Page header: round logo/initials, title, subtitle or chips, tools on the right. */
export function MuHeader({logo,initials,title,subtitle,chips,children}){
  const [brokenSrc,setBrokenSrc]=useState('');
  const broken=!!logo&&brokenSrc===logo; // a new picture URL gets a fresh try
  return <header className="mu-surface mu-head">
    <span className={`mu-head-logo${logo&&!broken?'':' mu-text'}`} aria-hidden="true">
      {logo&&!broken?<img src={logo} alt="" onError={()=>setBrokenSrc(logo)}/>:String(initials||'').slice(0,4)}
    </span>
    <div style={{minWidth:0}}><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}
      {chips?.length>0&&<div className="mu-chips">{chips.filter(c=>c&&c.value!==undefined&&c.value!==null&&c.value!=='').map(c=><span className="mu-chip" key={c.label}>{c.label} <b>{c.value}</b></span>)}</div>}</div>
    {children&&<div className="mu-head-tools">{children}</div>}
  </header>;
}

/** Pill tabs with counts. items: [{key,label,count}] */
export function MuTabs({items,value,onChange,label='Filters',role='group'}){
  return <div className="mu-tabs" role={role==='tablist'?'tablist':'group'} aria-label={label}>
    {items.map(item=><button type="button" key={item.key} role={role==='tablist'?'tab':undefined} aria-selected={role==='tablist'?value===item.key:undefined}
      className={`mu-tab${value===item.key?' active':''}`} onClick={()=>onChange(item.key)}>{item.label}{item.count!==undefined&&item.count!==null&&<b>{item.count}</b>}</button>)}
  </div>;
}

/** Approval stepper: [{label,state:'done'|'now'|'todo'}] */
export function MuSteps({steps}){
  if(!steps?.length)return null;
  return <div className="mu-steps" aria-label="Approval progress">{steps.map((step,index)=><div key={`${step.label}-${index}`} className={`mu-step ${step.state}`}>
    <i>{step.state==='done'?'✓':index+1}</i>{step.label}</div>)}</div>;
}
