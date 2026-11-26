/**
 * Institution Analytics — approved card UI (27 Oct 2026).
 * Institutions | Departments & Units, filtered by Financial Year.
 * Data: GET /analytics/organisations (published data only). Budget/absorption and
 * approved/submitted fields are read only when Laravel returns them (not yet confirmed).
 * Card click → organisation dashboard /dashboard/analytics/:type/:id (InstitutionDashboard.jsx).
 * Financial Year: real published years (each dataset's /options); a card shows how many datasets
 * have published data in the selected year (organisations endpoint has no year filter yet).
 */
import useRemembered, {isRefreshing} from '../../hooks/useRemembered.js';
import {NATIONAL_EMBLEM} from '../../utils/institutionLogo.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {cached,invalidate} from '../../services/listCache.js';
import {useLocation,useNavigate,useOutletContext} from 'react-router-dom';
import {chooseYear,clearAnalyticsCache,mapLimit,organisationYearCounts} from '../../services/institutionAnalyticsService.jsx';
import {analyticsAPI} from '../../API/analytics.jsx';
import {meReportsAPI} from '../../API/meReports.js';
import {analyticsTitle,userOrgScope} from '../../utils/orgScope.js';
import {loadMeFilters,meReportsForbidden,reportYearValue} from '../../services/meReportService.js';
import {listInstitutions} from '../../API/institution.jsx';
import {OrgGrid,OrgPanel,PerformanceOrgCard} from '../../components/orgCards/OrgCards.jsx';
import {TableLoader} from '../../components/common/LoadingState.jsx';
import {useBreadcrumbContext} from '../../contexts/BreadcrumbContext.jsx';
import {showUserFacingError} from '../../utils/userFacingErrors.js';
import {
  currentFinancialYear,orgHeading,orgInitials,orgMatches,orgPerformance,orgPicture,pickValue,sameFinancialYear
} from '../../utils/orgCards.js';

const LEGEND=[['excellence','Excellence >80%'],['good','Good 50–80%'],['under','Under Performance <50%']];
const keyOf=org=>String(org?.id??'');

function useAnalyticsBreadcrumb(title='Institution Analytics'){
  const context=useBreadcrumbContext(),location=useLocation();
  useEffect(()=>{
    context?.setBreadcrumb({path:location.pathname,segments:title==='Analytics'?[{text:'Analytics'}]:[{text:'Analytics'},{text:title}]});
  },[context?.setBreadcrumb,location.pathname,title]);
}

export default function InstitutionAnalytics(){
  const {logoVersion=0,user}=useOutletContext()??{};
  useAnalyticsBreadcrumb(analyticsTitle(user));
  const navigate=useNavigate(); // shared logo directory loaded -> cards re-read pictures
  const [type,setType]=useState('institution'),[search,setSearch]=useState(''),[year,setYear]=useState('');
  // Loading style F: the organisation list seen before shows at once while it refreshes.
  const [rows,setRows]=useRemembered('analytics:organisations',{institution:[],department:[]}),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
  const supervisedCount=Array.isArray(user?.supervised_institution_ids)?user.supervised_institution_ids.length:0;
  const [pictures,setPictures]=useState(new Map());
  // Published datasets per financial year, per organisation (from each dataset's /options years).
  const [yearCounts,setYearCounts]=useState({}),[countsLoading,setCountsLoading]=useState(false);
  const countedRef=useRef(new Set());

  useEffect(()=>{
    let alive=true;setLoading(true);
    if(reload){clearAnalyticsCache();invalidate('analytics:');countedRef.current=new Set();setYearCounts({});}
    Promise.all([analyticsAPI.organisations('institution'),analyticsAPI.organisations('department')])
      .then(([institution,department])=>{if(alive)setRows({institution,department});})
      .catch(error=>{if(alive){setRows({institution:[],department:[]});void showUserFacingError(error,'Analytics not loaded');}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[reload]);

  useEffect(()=>{
    // 5 Nov 2026: year counts (one options read per dataset) only for the tab on screen; the other tab
    // is counted when it is opened. Results are kept, so switching back costs nothing.
    const scope=userOrgScope(user);
    if((type==='institution'&&scope==='department'&&!supervisedCount)||(type==='department'&&scope==='institution'))return undefined;
    const todo=rows[type].map(org=>[type,org]).filter(([kind,org])=>!countedRef.current.has(`${kind}:${org.id}`));
    if(!todo.length)return undefined;
    let alive=true;setCountsLoading(true);
    // Two organisations at a time (each reads its datasets' years): the cards stay usable meanwhile.
    mapLimit(todo,2,([kind,org])=>organisationYearCounts(kind,org.id)).then(results=>{
      if(!alive)return;
      const next={};
      results.forEach((result,index)=>{const key=`${todo[index][0]}:${todo[index][1].id}`;if(result.ok){next[key]=result.value;countedRef.current.add(key);}});
      setYearCounts(current=>({...current,...next}));
    }).finally(()=>{if(alive)setCountsLoading(false);});
    return()=>{alive=false;};
  },[rows,user,type,supervisedCount]);

  // Financial years come from the real published reporting years (newest first).
  const years=useMemo(()=>{
    const labels=new Set();Object.values(yearCounts).forEach(counts=>Object.keys(counts).forEach(label=>labels.add(label)));
    const list=[...labels].sort().reverse();
    return list.length?list:[currentFinancialYear()];
  },[yearCounts]);
  const selectedYear=year&&years.some(label=>sameFinancialYear(label,year))?year:chooseYear(years,'');

  // Institution pictures (profile_image_url) come from GET /institutions when this role may read it.
  useEffect(()=>{
    let alive=true;
    cached('institutions:analytics-pictures',()=>listInstitutions({perPage:100}),300_000).then(result=>{
      if(!alive)return;
      const map=new Map();
      for(const item of result.items??[]){const url=orgPicture(item);if(url){map.set(`id:${item.id}`,url);if(item.code)map.set(`code:${String(item.code).toUpperCase()}`,url);}}
      setPictures(map);
    }).catch(()=>{/* no permission: initials are shown instead */});
    return()=>{alive=false;};
  },[]);

  // Budget absorption + score per organisation for the SELECTED year: GET /reports/organisation-performance
  // ?financialYear&groupBy=institution|department (skipped silently when the role has no report access).
  const [orgReport,setOrgReport]=useState({institution:[],department:[]});
  useEffect(()=>{
    if(!selectedYear)return undefined;
    let alive=true;
    loadMeFilters().catch(()=>null).then(filters=>{
      if(meReportsForbidden())return null; // no reports.view.* for this role: no 403 calls per year change
      const financialYear=reportYearValue(filters,selectedYear);
      // Only the tab on screen, shared for 5 minutes (cleared after any submission write).
      return cached(`analytics:org-report:${financialYear}:${type}`,()=>meReportsAPI.report('organisation-performance',{financialYear,groupBy:type}),300_000)
        .then(value=>({type,rows:Array.isArray(value?.rows)?value.rows:[]}),()=>({type,rows:[]}));
    }).then(result=>{
      if(!alive||!result)return;
      setOrgReport(current=>({...current,[result.type]:result.rows}));
    });
    return()=>{alive=false;};
  },[selectedYear,reload,type]);
  const reportFor=(kind,org)=>{
    const name=String(org.name??'').trim().toLowerCase(),code=String(org.code??org.short_name??'').trim().toUpperCase();
    return orgReport[kind].find(row=>{
      const rid=kind==='department'?(row.departmentId??row.department_id):(row.institutionId??row.institution_id);
      if(rid!==undefined&&rid!==null)return String(rid)===String(org.id);
      const label=String(row.institutionName??row.departmentName??row.label??'').trim();
      return label.toLowerCase()===name||label.toUpperCase()===code;
    })??null;
  };

  // Scope (30 Oct 2026): Laravel returns only the organisations this user may see. Institution users get no
  // departments, ministry-department users (DDO) no institutions: the other word is never shown to them.
  const userScope=userOrgScope(user);
  // 9 Nov 2026: a ministry department also sees the institutions it supervises (published data only; MOA sets the links).
  const scopeTypes=loading?[]:['institution','department'].filter(kind=>rows[kind].length&&(userScope==='all'||userScope===kind||(kind==='institution'&&userScope==='department'&&supervisedCount>0)));
  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(scopeTypes.length===1&&scopeTypes[0]!==type)setType(scopeTypes[0]);
  },[scopeTypes.join(),type]); // eslint-disable-line react-hooks/exhaustive-deps
  const countsKnown=Object.keys(yearCounts).length>0;
  const cards=useMemo(()=>rows[type].filter(org=>orgMatches(org,search)).map(org=>{
    const department=type==='department';
    const parentLabel=pickValue(org.institutionCode,org.institution_code,org.institution?.code,org.institutionName,org.institution_name,'Ministry of Industry and Trade');
    const counts=yearCounts[`${type}:${org.id}`];
    const inYear=counts?Object.entries(counts).find(([label])=>sameFinancialYear(label,selectedYear))?.[1]??0:null;
    const fromReport=reportFor(type,org);
    const performance=orgPerformance(fromReport?{...org,approvedBudget:fromReport.approvedBudget??fromReport.approved_budget,
      actualExpenditure:fromReport.actualExpenditure??fromReport.actual_expenditure,
      absorptionPercent:fromReport.budgetUtilisationPercent??fromReport.budgetUtilizationPercent??fromReport.utilisationPercent}:org);
    performance.score=fromReport?Number(fromReport.compositeScore??fromReport.deliveryPercent??NaN):NaN;
    return {...org,department,inYear,
      heading:orgHeading(org,{department,parentLabel}),
      initials:orgInitials(org),
      logo:department?NATIONAL_EMBLEM:pictures.get(`id:${org.id}`)||pictures.get(`code:${String(org.code??'').toUpperCase()}`)||orgPicture(org)||'',
      performance:{...performance,published:inYear??performance.published}};
  // eslint-disable-next-line react-hooks/exhaustive-deps -- logoVersion: pictures come from the shared directory
  }).sort((a,b)=>(a.inYear===0)-(b.inYear===0)),[rows,type,search,pictures,yearCounts,selectedYear,logoVersion,orgReport]);

  const changeType=next=>{setType(next);setSearch('');};
  const open=org=>navigate(`/dashboard/analytics/${type}/${org.id}?year=${encodeURIComponent(selectedYear)}`,
    {state:{org:{id:org.id,name:org.name,code:org.code,short_name:org.short_name,profile_image_url:org.logo||null}}});
  return <div className={`container-fluid px-0${isRefreshing(loading,rows.institution.length+rows.department.length>0)?' mu-refreshing':''}`}>
    <OrgPanel labels={userScope==='department'?{department:'Our Department',institution:'Supervised Institutions'}:{}}
      title={`${type==='department'?(userScope==='department'?'Our Department':'Department & Unit Performance'):(userScope==='department'?'Supervised Institutions':'Institution Performance')} · FY ${selectedYear}`}
      type={type} onType={changeType} types={scopeTypes.length?scopeTypes:[type]} counts={loading&&!(rows.institution.length+rows.department.length)?{}:{institution:rows.institution.length,department:rows.department.length}}
      search={search} onSearch={setSearch} years={years} year={selectedYear} onYear={setYear}
      onRefresh={()=>setReload(n=>n+1)} legend={LEGEND}>
      <OrgGrid loading={loading} empty={!cards.length?(search?'No organisation matches your search.':'No published analytics yet.'):''}>
        {cards.map(org=><PerformanceOrgCard key={`${type}-${keyOf(org)}`} logo={org.logo} initials={org.initials}
          title={org.heading.title} subtitle={org.heading.subtitle} performance={org.performance}
          yearNote={countsKnown?(org.inYear?`FY ${selectedYear}`:`No data for FY ${selectedYear}`):''} dim={countsKnown&&org.inYear===0}
          onOpen={()=>open(org)}/>)}
      </OrgGrid>
      {!loading&&countsLoading&&<div style={{position:'relative',minHeight:60}}><TableLoader active label="Checking published years…"/></div>}
    </OrgPanel>
  </div>;
}
