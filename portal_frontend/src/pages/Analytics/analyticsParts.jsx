/** Shared pieces for the Institution dashboard and Dataset analytics pages. */
import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import {analyticsAPI} from '../../API/analytics.jsx';
import {listInstitutions} from '../../API/institution.jsx';
import {useBreadcrumbContext} from '../../contexts/BreadcrumbContext.jsx';
import {orgHeading,orgInitials,orgPicture} from '../../utils/orgCards.js';

export const BAND_COLORS={excellence:'#1eb53a',good:'#e0b400',under:'#d92d20',none:'#c5cbd6'};
export const BAND_INK={excellence:'#0f7a2f',good:'#8a6a00',under:'#b42318',none:'#5b6478'};

export function useAnalyticsBreadcrumb(segments){
  const context=useBreadcrumbContext(),location=useLocation();
  const encoded=JSON.stringify(segments);
  useEffect(()=>{context?.setBreadcrumb({path:location.pathname,segments:JSON.parse(encoded)});},[context?.setBreadcrumb,location.pathname,encoded]);
}

/** Organisation name / code / picture: router state first, then the analytics + institutions lists. */
export function useOrganisation(type,id,fromState){
  const [org,setOrg]=useState(fromState&&String(fromState.id)===String(id)?fromState:null);
  useEffect(()=>{
    let alive=true;
    analyticsAPI.organisations(type).then(rows=>{
      const found=rows.find(row=>String(row.id)===String(id));
      if(alive&&found)setOrg(current=>({...found,...(current??{}),...found}));
    }).catch(()=>{});
    if(type==='institution')listInstitutions({perPage:100}).then(result=>{
      const found=(result.items??[]).find(row=>String(row.id)===String(id));
      if(alive&&found)setOrg(current=>({...(current??{}),...found,...(current??{}),profile_image_url:found.profile_image_url,profile_image_path:found.profile_image_path}));
    }).catch(()=>{});
    return()=>{alive=false;};
  },[type,id]);
  const department=type==='department';
  const heading=orgHeading(org??{},{department,parentLabel:'Ministry of Industry and Trade'});
  return {org,heading,initials:orgInitials(org??{}),picture:department?'':orgPicture(org??{}),fullName:org?.name??''};
}

export function OrgHeader({identity,backLabel,onBack,children,subtitle}){
  const {heading,initials,picture,fullName}=identity;
  const [brokenSrc,setBrokenSrc]=useState('');
  const broken=!!picture&&brokenSrc===picture;
  const setBroken=()=>setBrokenSrc(picture);
  return <header className="ia-surface ia-head">
    <span className={`ia-head-logo${picture&&!broken?'':' ia-text'}`} aria-hidden="true">
      {picture&&!broken?<img src={picture} alt="" onError={()=>setBroken(true)}/>:initials}
    </span>
    <div><h1>{heading.title||'…'}</h1><p>{subtitle??[fullName!==heading.title?fullName:'',heading.subtitle!==fullName?heading.subtitle:''].filter(Boolean).join(' · ')}</p></div>
    <div className="ia-tools">
      <button type="button" className="ia-back" onClick={onBack}><ArrowLeft size={15}/> {backLabel}</button>
      {children}
    </div>
  </header>;
}

export function SelectBox({label,value,onChange,options,disabled}){
  return <label className="ia-select"><small>{label}</small>
    <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
      {options.map(option=>typeof option==='string'
        ?<option key={option} value={option}>{option}</option>
        :<option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

/** Small progress ring (SVG). */
export function Ring({percent,color,size=44,stroke=6,label=true}){
  const r=(size-stroke)/2,c=2*Math.PI*r,p=Math.max(0,Math.min(100,Number(percent)||0));
  return <svg width={size} height={size} aria-hidden="true">
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#eef1f6" strokeWidth={stroke}/>
    {percent!==null&&percent!==undefined&&<circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={`${(c*p)/100} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:'stroke-dasharray .6s ease'}}/>}
    {label&&percent!==null&&percent!==undefined&&<text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={size>60?15:11} fontWeight="700" fill="#0a2a5c">{Math.round(percent)}%</text>}
  </svg>;
}

export function KpiCard({icon,title,value,note,valueColor,onOpen}){
  return <button type="button" className="ia-kpi" onClick={onOpen}>
    {icon}<span className="ia-kpi-text"><small>{title}</small><b style={valueColor?{color:valueColor}:undefined}>{value}</b><span>{note}</span></span>
  </button>;
}

export const fmtNumber=value=>value===null||value===undefined?'':Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
export const fmtChange=value=>value===null||value===undefined?'—':`${value>0?'+':''}${value}%`;
