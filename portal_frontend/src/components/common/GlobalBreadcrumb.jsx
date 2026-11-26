/** Shared compact government path bar across every /dashboard route. */
import {ChevronRight,Home} from 'lucide-react';
import {useLocation,useNavigate} from 'react-router-dom';
import {useBreadcrumbContext} from '../../contexts/BreadcrumbContext.jsx';
import {useLanguage} from '../../i18n/LanguageContext.jsx';
import '../../styles/global-breadcrumb.css';

const names={
  dashboard:'Dashboard',administration:'Administration',institutions:'Institutions',
  departments:'Departments & Units',users:'Users',datasets:'Datasets',
  submissions:'Submissions',mdo:'Ministry Review',mdd:'Director Approval',
  queue:'Review Queue',ready:'Review Queue',review:'Review Submission',
  source:'Dataset Overview',reviewed:'Reviewed',returned:'Returned',
  published:'Published',notifications:'Notifications',profile:'My Profile',
  'data-entry':'Data Entry','approval-circle':'Approval Circle',
  'roles-permissions':'Roles & Permissions',settings:'Settings',
  'new':'New Submission',inbox:'Pending Review',history:'Review History',
  ao:'Account Officer',hod:'Department Review',pending:'Pending Approval',
};
const title=value=>names[value]??value.replace(/-/g,' ').replace(/\b\w/g,x=>x.toUpperCase());

export default function GlobalBreadcrumb(){
  const location=useLocation(),navigate=useNavigate(),ctx=useBreadcrumbContext(),{t}=useLanguage();
  const pieces=location.pathname.split('/').filter(Boolean).slice(1);
  const fallback=[{text:'Dashboard',to:'/dashboard'}];
  let url='/dashboard';
  pieces.forEach(part=>{
    url+=`/${part}`;
    fallback.push({text:/^\d+$/.test(part)?`#${part}`:title(part),to:url});
  });
  const segments=ctx?.path===location.pathname&&ctx?.segments?.length?
    [{text:'Dashboard',to:'/dashboard'},...ctx.segments]:fallback;
  return <nav className="vw-global-breadcrumb" aria-label="Breadcrumb">
    <div className="vw-global-breadcrumb-inner">
      {segments.map((part,i)=><span className="vw-global-crumb" key={`${i}-${part.text}`}>
        {i>0&&<ChevronRight size={13} aria-hidden="true"/>}
        {i===0&&<Home size={14} aria-hidden="true"/>}
        {/* Current (last) segment is rendered once, in <strong>, never twice. */}
        {i<segments.length-1&&(part.to?
          <button type="button" onClick={()=>navigate(part.to)}>{t(part.text)}</button>:
          <span className="vw-crumb-text">{t(part.text)}</span>)}
        {i===segments.length-1&&<strong aria-current="page">{t(part.text)}</strong>}
      </span>)}
    </div>
  </nav>;
}
