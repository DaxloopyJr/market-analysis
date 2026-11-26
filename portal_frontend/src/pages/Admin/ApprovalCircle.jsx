import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE PATH: src/pages/Admin/ApprovalCircle.jsx
 * ROUTE: /dashboard/administration/approval-circle
 * NAVIGATION: Login -> ProtectedRoute -> DashboardLayout -> RouteAccess -> ApprovalCircle.
 * APPROVED UI v2 (user image 23 Oct 2026): full-width workflow version table,
 *   selected workflow details below with tabs/timeline, and a Create/Edit side panel (not a modal).
 *   Approval role and optional assigned user are edited INSIDE each workflow step.
 * DATA FLOW: ApprovalCircle.jsx -> API/approvalCircle.jsx -> API/axios.jsx -> Laravel.
 * VERIFIED BACKEND #62-68: GET/POST /approval-circles, GET/PUT /approval-circles/{id},
 * PUT /approval-circle-steps/{step}, POST /approval-circles/{id}/activate and /clone.
 * IA workflow uses own institution; MOA workflow uses ministry/global only.
 * Laravel determines scope from auth token. institution_id is PROHIBITED in writes.
 * No deactivate endpoint; active workflows must be cloned into a new draft version.
 * Steps that have been reordered via PUT are recreated with NEW database IDs.
 * Real institution/department/role options can be fetched from confirmed APIs
 * when grants allow. NO MOCK APPROVAL CIRCLES or fake saved records.
 */
import {useCallback,useEffect,useMemo,useState} from 'react';
import Swal from "../../utils/portalAlerts";
import {
  ArrowDown,ArrowUp,Check,ChevronLeft,ChevronRight,ClipboardCheck,Eye,Info,
  Pencil,Plus,RotateCcw,Search,Settings2,Trash2,Workflow,
} from 'lucide-react';
import {useOutletContext} from 'react-router-dom';
import {
  listApprovalCircles,createApprovalCircle,
  replaceApprovalCircle,getApprovalCircle,
  activateApprovalCircle,cloneApprovalCircle,
} from '../../API/approvalCircle';
import {listRoles} from '../../API/roles';
import {listUsers} from '../../API/users';
import {userInstitutionId} from '../../utils/datasetOwnership';
import {approvalRoleOptions,approvalUsersForRole,scopeApprovalUsers} from '../../utils/approvalCircleAssignees';
import {apiError,validationErrors} from '../../API/resourceHelpers';
import './institutions.css';
import './approvalCircle.css';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import {MuHeader, MuKpi, MuLogo, MuSkeletonRows, MuTabs} from '../../components/modern/ModernUI.jsx';
import {institutionLogoUrl} from '../../utils/institutionLogo.js';
import {orgInitials} from '../../utils/orgCards.js';
import {countText} from '../../utils/adminDisplay.js';
import {Archive, CheckCircle2, PencilLine, Workflow as WorkflowIcon} from 'lucide-react';
import '../../styles/admin-modern.css';

const empty = () => ({name:'',status:'draft',process_type:'',description:'',is_active:false,levels:[],institution_id:'',
  institution_ids:[],department_ids:[],role_ids:[],remarks:''});
const hasText = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const display = (value) => hasText(value)?String(value):'—';
const isActive = (row) => row?.is_active===true||(row?.is_active==null&&row?.status==='active');
const formattedDate = (value) => value?String(value).replace('T',' ').slice(0,16):'—';

function circleLabel(record){return record?.name || record?.title || 'Unnamed Approval Circle';}
function normalizeCircle(record){return {
  ...empty(),...record,
  name:record?.name||'',
  institution_id:record?.institution?.id??record?.institution_id??'',
  levels:(record?.steps||[]).map((step)=>({
    id:step.id,sequence:step.sequence,
    name:step.step_name,
    approver_position:step.required_role_code,
    required_role_code:step.required_role_code,
    assigned_user_id:step.assigned_user?.id??step.assigned_user_id??'',
    action:step.action,
    level:step.level,
    assigned_user:step.assigned_user,
    can_return:step.can_return!==false,
  })).sort((a,b)=>(a.sequence??0)-(b.sequence??0)),
  institution_ids:record?.institution?[record.institution.id]:[],
  department_ids:[],role_ids:[],
  is_active:isActive(record),
};}

/** Load every institution/department option page; never imply partial choices are complete. */
async function loadAllOptions(fetchPage){
  const first=await fetchPage(1);
  if(first.lastPage>30) throw new Error('Too many options to list. Please narrow your search.');
  const all=[...first.items];
  for(let page=2;page<=first.lastPage;page++){
    const result=await fetchPage(page);
    all.push(...result.items);
  }
  return all;
}

function LevelEditor({initial,onCancel,onApply,users,roleOptions,scope,usersLoading,usersError}){
  const [level,setLevel]=useState({
    name:initial?.name||'',
    required_role_code:initial?.required_role_code||'',
    assigned_user_id:initial?.assigned_user_id||'',
    action:initial?.action||'review',
    level:scope,
    can_return:initial?.can_return!==false,
  });
  const set=(key,val)=>setLevel(prev=>({...prev,[key]:val}));
  const scopedChoices=approvalUsersForRole(users,level.required_role_code);
  const originalAssignee=initial?.assigned_user;
  // Keep an existing assignment visible if Laravel omitted it from GET /users.
  // Do not invent an eligible person; backend validates it when saving.
  const missingExisting=level.assigned_user_id&&!scopedChoices.some(u=>String(u.id)===String(level.assigned_user_id));
  const setRole=value=>setLevel(prev=>({...prev,required_role_code:value,assigned_user_id:
    prev.required_role_code===value?prev.assigned_user_id:''}));
  return <div className="vim-ac-level-editor">
    <h4>{initial?'Edit Approval Level':'Add Approval Level'}</h4>
    <div className="vim-ac-level-inputs">
      <label>Level Name *<input className="form-control" value={level.name} onChange={e=>set('name',e.target.value)} placeholder="Enter level name"/></label>
      <label>Approver Role/Position *
        {roleOptions.length?<select className="form-select" value={level.required_role_code} onChange={e=>setRole(e.target.value)}>
          <option value="">Select role...</option>
          {level.required_role_code&&!roleOptions.some(role=>role.code===level.required_role_code)&&<option value={level.required_role_code}>{level.required_role_code} (existing role)</option>}
          {roleOptions.map(role=><option key={role.code} value={role.code}>{role.name} ({role.code})</option>)}
        </select>:<input className="form-control" value={level.required_role_code} onChange={e=>setRole(e.target.value.toUpperCase())} placeholder="Enter role code"/>}
      </label>
      <label>Approval Type<select className="form-select" value={level.action} onChange={e=>set('action',e.target.value)}>
        <option value="review">Review / Forward / Return</option><option value="approve">Approve / Return</option>
        {scope==='ministry'&&<option value="publish">Publish (Ministry only)</option>}
      </select></label>
      {scope==='institution'&&<label>Assigned User (Optional)
        <select className="form-select" value={level.assigned_user_id} disabled={usersLoading} onChange={e=>set('assigned_user_id',e.target.value)}>
          <option value="">No specific assignee (routed by role)</option>
          {missingExisting&&<option value={level.assigned_user_id}>{originalAssignee?.name||`Previously assigned user #${level.assigned_user_id}`}</option>}
          {scopedChoices.map(user=><option key={user.id} value={user.id}>{user.name||user.email||`User #${user.id}`} ({user.email||'no email'})</option>)}
        </select>
        {usersLoading&&<small className="text-muted">Loading institution users...</small>}
        
        {!usersLoading&&!usersError&&!scopedChoices.length&&<small className="text-muted">No eligible users returned. IA requires authorized GET /users; leave unassigned to use role-based routing.</small>}
        {!usersLoading&&!usersError&&scopedChoices.some(user=>!user.roles&&!user.role&&!user.role_code)&&
          <small className="text-muted">Some user records have no role metadata. The system validates the assigned user's role on save.</small>}
      </label>}
    </div>
    <label className="vim-ac-v2-return-setting">
      <input type="checkbox" checked={level.can_return} onChange={e=>set('can_return',e.target.checked)}/>
      Allow approver to return a submission for correction
    </label>
    <p className="small text-muted">Scope: {scope==='ministry'?'Ministry (global)':'Own institution'} · Ministry steps cannot assign an individual user.</p>
    <div className="vim-ac-buttons"><button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Cancel</button>
      <button className="btn btn-primary" type="button" disabled={!level.name.trim()||!level.required_role_code.trim()} onClick={()=>onApply(level)}>Apply Level</button>
    </div>
  </div>;
}

export default function ApprovalCircle(){
  const {user}=useOutletContext();
  const [rows,setRows]=useState([]);
  const [page,setPage]=useState(1);
  const [searchInput,setSearchInput]=useState('');
  const [selected,setSelected]=useState(null);
  const [mode,setMode]=useState('details'); // add | edit | details
  const [form,setForm]=useState(empty);
  const [errors,setErrors]=useState({});
  const [loadError,setLoadError]=useErrorDialogState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [revision,setRevision]=useState(0);
  const [levelEditing,setLevelEditing]=useState(null);
  const [levelEditorKey,setLevelEditorKey]=useState(0);
  const [statusFilter,setStatusFilter]=useState('all');
  const [scopeFilter,setScopeFilter]=useState('all');
  const [viewTab,setViewTab]=useState('steps');
  const [roles,setRoles]=useState([]);
  const [users,setUsers]=useState([]);
  const [optionsError,setOptionsError]=useErrorDialogState('');
  const [usersLoading,setUsersLoading]=useState(false);
  const canEdit=Boolean(user?.permissions?.some(p=>p==='approval_circle.manage.ministry'||p==='approval_circle.manage.institution'));
  const scope=user?.permissions?.includes('approval_circle.manage.ministry')?'ministry':'institution';
  const institutionId=userInstitutionId(user);
  const roleOptions=useMemo(()=>approvalRoleOptions({users,circles:rows,directoryRoles:roles,scope}),[users,rows,roles,scope]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setLoadError('');
    listApprovalCircles().then(result=>{
      if(!active)return;
      const items=result.items.map(normalizeCircle);
      setRows(items);
      setSelected(previous=>{
        if(!previous)return items[0]||null;
        return items.find(item=>item.id===previous.id)||previous;
      });
    }).catch(error=>{if(active){setRows([]);setLoadError(apiError(error));}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[revision]);

  /**
   * ROLE / USER PICKERS — VERIFIED ENDPOINTS ONLY:
   * MOA: GET /roles (roles.manage); ministry stages cannot select a user.
   * IA:  GET /users (users.manage.institution), backend scopes to IA institution.
   * IA does NOT call GET /roles. Derive role codes from scoped user.roles and
   * existing approval-circle steps. If roles/assignees are not returned, show
   * the missing permission/error instead of creating fake option records.
   * POST/PUT circles send required_role_code and optional assigned_user_id
   * inside steps; Step 3 has no unsupported role_ids selector.
   */
  useEffect(()=>{
    if(mode!=='add'&&mode!=='edit')return;
    let active=true;
    setOptionsError('');setUsers([]);setRoles([]);
    if(scope==='ministry'){
      if(user?.permissions?.includes('roles.manage')){
        listRoles().then(r=>{if(active)setRoles(r.items);})
          .catch(e=>{if(active)setOptionsError(apiError(e));});
      }else if(active){setOptionsError('Ministry roles require roles.manage permission for ');}
    }else{
      if(!institutionId){
        setOptionsError('Your account has no institution ID from /me. Cannot safely list institution users.');
      }else if(!user?.permissions?.includes('users.manage.institution')){
        setOptionsError('You need permission to view users to choose approvers.');
      }else{
        setUsersLoading(true);
        loadAllOptions(page=>listUsers({page})).then(items=>{
          if(active)setUsers(scopeApprovalUsers(items,institutionId));
        }).catch(e=>{if(active)setOptionsError(`Unable to load institution users: ${apiError(e)}`);})
          .finally(()=>{if(active)setUsersLoading(false);});
      }
    }
    return ()=>{active=false;};
  },[mode,scope,institutionId,user?.permissions]);

  // GET /approval-circles returns an unpaginated array; search/page happen locally.
  // Do not send invented page/search filters to the backend.
  const [pageSize,setPageSize]=usePageSize('approval-circles',10);
  const change=(key,value)=>{setForm(prev=>({...prev,[key]:value}));setErrors(prev=>({...prev,[key]:''}));};
  const beginAdd=()=>{setMode('add');setForm({...empty(),institution_id:scope==='institution'?(user?.institution?.id||''):''});setErrors({});setLevelEditing(null);};
  const showDetails=(row)=>{setSelected(row);setForm(normalizeCircle(row));setMode('details');setErrors({});setLevelEditing(null);};
  const beginEdit=()=>{if(!selected)return;setForm(normalizeCircle(selected));setMode('edit');setErrors({});};
  /** An ACTIVE workflow is immutable: clone to a NEW draft version before editing. */
  async function cloneForEdit(){
    if(!selected)return;
    setSaving(true);
    try{
      const created=await cloneApprovalCircle(selected.id);
      const id=created.data?.id;
      if(!id)throw new Error('The system clone response did not contain an approval circle ID.');
      const detail=(await getApprovalCircle(id)).data;
      const draft=normalizeCircle(detail);
      setSelected(draft);setForm(draft);setMode('edit');setErrors({});reload();
      await Swal.fire({icon:'success',title:'New draft version created',text:`Approval Circle #${id} is ready for editing. The active version remains unchanged.`});
    }catch(e){await Swal.fire({icon:'error',title:'Unable to clone',text:apiError(e)});}
    finally{setSaving(false);}
  }
  const reload=useCallback(()=>setRevision(n=>n+1),[]);

  const validateBasic=()=>{
    const next={};
    if(!form.name.trim())next.name='Approval Circle Name is required.';
    // Process Type is reference-only; backend POST does not accept it.
    setErrors(next);
    return Object.keys(next).length===0;
  };

  /**
   * CREATE: IA and MOA scopes are inferred from Laravel-authenticated user,
   * NEVER pass institution_id in POST. PUT: replace draft steps atomically.
   * Activation is a distinct POST after draft review.
   */
  const save=async()=>{
    if(!validateBasic())return;
    if(!form.levels.length){await Swal.fire({icon:'warning',title:'Approval levels required',text:'Add at least one approval level.'});return;}
    if(mode==='edit' && selected?.status!=='draft'){
      await Swal.fire({icon:'info',title:'Clone this workflow first',text:'Only a draft approval circle can be edited. Use Clone as Draft to preserve the active version.'});return;
    }
    setSaving(true);
    try{
      const payload={name:form.name,steps:form.levels.map(level=>({
        step_name:level.name,required_role_code:level.required_role_code,
        ...(scope==='institution'&&level.assigned_user_id?{assigned_user_id:level.assigned_user_id}:{}),
        action:level.action,level:scope,can_return:level.can_return!==false,
      }))};
      const result=mode==='edit'
        ?await replaceApprovalCircle(selected.id,payload,scope)
        :await createApprovalCircle(payload,scope);
      await Swal.fire({icon:'success',title:mode==='edit'?'Draft Approval Circle updated':'Draft Approval Circle created',
        text:result.message||'Draft saved. Activate it when ready.'});
      const saved=result.data?.id?normalizeCircle(result.data):null;
      if(saved)setSelected(saved);
      setLevelEditing(null);setMode('details');reload();
    }catch(e){setErrors({});await Swal.fire({icon:'error',title:'Request failed',text:apiError(e)});}
    finally{setSaving(false);}
  };
  async function confirmStatus(){
    if(!selected)return;
    if(selected.status!=='draft'){
      await Swal.fire({icon:'info',title:'Deactivate is not available yet',text:'Active workflow versions are immutable. Clone and activate a new draft to retire the previous active version.'});return;
    }
    const confirm=await Swal.fire({icon:'warning',title:'Activate approval circle?',text:'The previous active version will be retired. Existing submissions keep their current workflow.',showCancelButton:true,confirmButtonText:'Activate'});
    if(!confirm.isConfirmed)return;
    setSaving(true);
    try{const result=await activateApprovalCircle(selected.id);
      await Swal.fire({icon:'success',title:'Approval Circle activated',text:result.message||'Activated.'});
      setMode('details');reload();
    }catch(e){await Swal.fire({icon:'error',title:'Unable to activate',text:apiError(e)});}
    finally{setSaving(false);}
  }

  async function saveLevel(value){
    if(levelEditing==='new'){
      change('levels',[...form.levels,{...value,order:form.levels.length+1,id:`draft-${Date.now()}`}]);
    }else{
      change('levels',form.levels.map((level,index)=>index===levelEditing?{...level,...value}:level));
    }
    // No API write here. Save Approval Circle uses PUT /approval-circles/{id}
    // for a draft with the WHOLE ordered list; Laravel regenerates step IDs.
    setLevelEditing(null);
  }



  // APPROVAL CIRCLE UI/UX v2: Laravel list -> searchable table -> selected workflow
  // details -> non-modal Create/Edit side panel. All writes still use the existing API services.
  // No institution/global IDs or unsupported description/process type in payloads.
  const selectedStatus = value => value?.status || (isActive(value) ? 'active' : 'draft');
  const statusCounts = {
    all: rows.length,
    active: rows.filter(row => selectedStatus(row) === 'active').length,
    draft: rows.filter(row => selectedStatus(row) === 'draft').length,
    retired: rows.filter(row => selectedStatus(row) === 'retired').length,
  };
  const editorOpen = mode === 'add' || mode === 'edit';
  const scopedRows = rows.filter(row => {
    const matchesText = `${circleLabel(row)} ${row.description || ''} ${row.scope_key || ''}`.toLowerCase().includes(searchInput.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || selectedStatus(row) === statusFilter;
    const matchesScope = scopeFilter === 'all' || (scopeFilter === 'ministry'
      ? row.institution_id == null || row.institution_id === ''
      : row.institution_id != null && row.institution_id !== '');
    return matchesText && matchesStatus && matchesScope;
  });
  const tablePages = Math.max(1, Math.ceil(scopedRows.length / pageSize));
  const tablePage = Math.min(page, tablePages);
  const shownRows = scopedRows.slice((tablePage - 1) * pageSize, tablePage * pageSize);
  const scopeCaption = scope === 'ministry' ? 'Ministry (Global)' : 'Institution (Own Institution)';
  const scopeBadgeText = row => row.institution_id == null || row.institution_id === '' ? 'Ministry (Global)' : (row.institution?.name || 'Own Institution');
  const versionRows = selected ? rows.filter(row =>
    row.name === selected.name && String(row.scope_key || row.institution_id || '') === String(selected.scope_key || selected.institution_id || '')
  ).sort((a,b) => Number(b.version_number || 0) - Number(a.version_number || 0)) : [];
  const statusBadge = row => <span className={`vim-ac-v2-badge ${selectedStatus(row)}`}>
    {selectedStatus(row) === 'active' ? 'Active' : selectedStatus(row) === 'retired' ? 'Retired' : 'Draft'}
  </span>;
  const scopeBadge = row => <span className={`vim-ac-v2-scope ${row.institution_id == null || row.institution_id === '' ? 'ministry' : 'institution'}`}>
    {row.institution_id == null || row.institution_id === '' ? 'Ministry (Global)' : (()=>{
      const org = row.institution ?? (String(user?.institution?.id ?? user?.institution_id ?? '') === String(row.institution_id) ? user?.institution : null);
      return <><MuLogo src={institutionLogoUrl(org)} initials={orgInitials(org ?? {name: 'Institution'})} size={20}/>{org?.name || 'Own Institution'}</>;
    })()}
  </span>;
  const closeEditor = () => {setLevelEditing(null);setMode('details');setErrors({});};
  const reorderLevel = (index, direction) => {
    const nextIndex = index + direction;
    if(nextIndex < 0 || nextIndex >= form.levels.length) return;
    const updated = [...form.levels];
    [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
    change('levels', updated.map((item,i) => ({...item, order:i+1})));
  };

  const pickStatus=key=>{setStatusFilter(key);setPage(1);};
  const preview=selected ?? rows.find(row=>isActive(row)) ?? rows[0] ?? null;
  return <main className="vim-institutions vim-approval-circle vim-ac-v2 adm-modern container-fluid px-0">
    <MuHeader initials="⟳" title="Approval Circle" subtitle="Approval workflows and their versions within your authorized scope">
      {canEdit && <button className="mu-btn mu-btn-primary vim-ac-v2-create" type="button" onClick={beginAdd}><Plus size={17}/> Create Workflow</button>}
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<WorkflowIcon size={18}/>} title="Workflows" value={countText(statusCounts.all,'version',loading)} note="in your scope" arrow={false} onOpen={()=>pickStatus('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(statusCounts.active,'workflow',loading)} note="in use now" arrow={false} onOpen={()=>pickStatus('active')}/>
      <MuKpi tone="amber" icon={<PencilLine size={18}/>} title="Drafts" value={countText(statusCounts.draft,'draft',loading)} note="not yet active" arrow={false} onOpen={()=>pickStatus('draft')}/>
      <MuKpi tone="red" icon={<Archive size={18}/>} title="Retired" value={countText(statusCounts.retired,'version',loading)} note="history kept" arrow={false} onOpen={()=>pickStatus('retired')}/>
    </div>

    <div className="adm-split vim-ac-v2-top">
    <section className="vim-ac-v2-workflows adm-card" aria-label="Approval workflow versions">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Workflow versions</h2><span className="mu-count">{loading?'…':statusCounts.all}</span></header>
      <div className="vim-ac-v2-toolbar adm-toolbar">
        <div className="vim-ac-v2-filter-tabs adm-tabs-wrap"><MuTabs label="Filter workflow status" value={statusFilter} onChange={pickStatus} items={[
          {key:'all',label:'All',count:statusCounts.all},{key:'active',label:'Active',count:statusCounts.active},
          {key:'draft',label:'Drafts',count:statusCounts.draft},{key:'retired',label:'Retired',count:statusCounts.retired}]}/></div>
        <div className="vim-ac-v2-tools">
          <label className="vim-ac-v2-search"><Search size={16}/>
            <input aria-label="Search workflows" value={searchInput} onChange={e=>{setSearchInput(e.target.value);setPage(1);}} placeholder="Search workflows..."/>
          </label>
          <select aria-label="Filter by scope" className="form-select" value={scopeFilter} onChange={e=>{setScopeFilter(e.target.value);setPage(1);}}>
            <option value="all">All Scopes</option><option value="ministry">Ministry</option><option value="institution">Institution</option>
          </select>
        </div>
      </div>
      
      <div className="vim-ac-v2-table-scroll">
        <table className="vim-ac-v2-table">
          <thead><tr><th>#</th><th>Workflow Name</th><th>Scope</th><th>Version</th><th>Status</th><th>Created At</th><th aria-label="Actions"/></tr></thead>
          <tbody>
            {shownRows.map((row,index)=><tr key={row.id} className={selected?.id===row.id?'selected':''}>
              <td>{(tablePage-1)*pageSize+index+1}</td>
              <td><button type="button" className="vim-ac-v2-workflow-link" onClick={()=>{showDetails(row);setViewTab('steps');}}>{circleLabel(row)}</button>
                <small>{row.description || (row.institution_id == null || row.institution_id === '' ? 'Ministry approval workflow' : 'Institution approval workflow')}</small></td>
              <td>{scopeBadge(row)}</td>
              <td>v{row.version_number ?? '—'}</td>
              <td>{statusBadge(row)}</td>
              <td><span className="vim-ac-v2-date">{formattedDate(row.created_at || row.createdAt)}</span></td>
              <td className="mu-actions"><RowActionsMenu label={`Workflow actions for ${circleLabel(row)}`}>
                <button type="button" title="View workflow" aria-label={`View ${circleLabel(row)}`} onClick={()=>{showDetails(row);setViewTab('steps');}}><Eye size={15}/></button>
                {canEdit && (row.status==='draft'
                  ? <button type="button" title="Edit draft workflow" aria-label={`Edit ${circleLabel(row)}`} onClick={()=>{setSelected(row);setForm(normalizeCircle(row));setMode('edit');setErrors({});setLevelEditing(null);}}><Pencil size={15}/></button>
                  : <button type="button" title="View immutable version" disabled><Pencil size={15}/></button>)}
                {canEdit && <button type="button" title="Select for clone or activation" aria-label={`Workflow actions for ${circleLabel(row)}`}
                  onClick={()=>{showDetails(row);setViewTab('steps');}}><Settings2 size={15}/></button>}
              </RowActionsMenu></td>
            </tr>)}
            {!loading&&!shownRows.length&&<tr><td colSpan={7} className="vim-ac-v2-empty">No approval circles match this filter.</td></tr>}
            {loading&&<MuSkeletonRows cols={7} rows={5}/>}
          </tbody>
        </table>
      </div>
      <div className="vim-ac-v2-pager">
        <PageSizeSelect value={pageSize} onChange={v=>{setPageSize(v);setPage(1);}}/>
        {tablePages>1&&<><button type="button" disabled={tablePage<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button>
        Page {tablePage} of {tablePages}
        <button type="button" disabled={tablePage>=tablePages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></>}
      </div>
    </section>
    {/* Side panel (approved mockup): steps of the selected workflow, or the first active one. */}
    <aside className="adm-card vim-ac-v2-side" aria-label="Workflow steps">
      {preview ? <>
        <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2 title={circleLabel(preview)}>{circleLabel(preview)} · v{preview.version_number ?? '—'}</h2>{statusBadge(preview)}</header>
        <ol className="vim-ac-v2-side-steps">
          {(preview.levels||[]).map((level,index)=><li key={level.id??index}><span className="vim-ac-v2-side-no">{index+1}</span>
            <div><b>{display(level.required_role_code||level.approver_position)}</b><small>{[level.name,level.action].filter(Boolean).join(' · ')||'Approval step'}{level.assigned_user?.name?` · ${level.assigned_user.name}`:''}</small></div></li>)}
          {!(preview.levels||[]).length&&<li className="vim-ac-v2-side-empty">No steps configured yet.</li>}
        </ol>
        <dl className="vim-ac-v2-side-facts"><div><dt>Scope</dt><dd>{scopeBadgeText(preview)}</dd></div>
          <div><dt>Created</dt><dd>{formattedDate(preview.created_at || preview.createdAt)}</dd></div>
          <div><dt>Steps</dt><dd>{(preview.levels||[]).length}</dd></div></dl>
        {selected?.id!==preview.id&&<button type="button" className="mu-btn vim-ac-v2-side-open" onClick={()=>{showDetails(preview);setViewTab('steps');}}>Open full details</button>}
      </> : <div className="mu-empty">{loading?'Loading workflows…':'No workflow to show yet. Create one to see its steps here.'}</div>}
    </aside>
    </div>

    {/* Contextual editor: share the page with workflow details, not a modal. */}
    <div className={`vim-ac-v2-lower ${editorOpen ? 'editor-open' : ''} ${!selected&&!editorOpen?'is-empty':''}`}>
    <section className="vim-ac-v2-detail" aria-label="Selected workflow details">
      {selected ? <>
        <header className="vim-ac-v2-detail-header">
          <div className="vim-ac-v2-detail-identity">
            <div className="vim-ac-v2-detail-icon"><Workflow size={24}/></div>
            <div><div className="vim-ac-v2-detail-name"><h2>{circleLabel(selected)}</h2>{statusBadge(selected)}<span className="vim-ac-v2-version">Version {selected.version_number ?? '—'}</span></div>
              <p>{selected.description || `${scopeBadgeText(selected)} approval workflow`}</p></div>
          </div>
          <div className="vim-ac-v2-detail-actions">
            <small>Created: {formattedDate(selected.created_at || selected.createdAt)}</small>
            {canEdit && selected.status==='draft' && <>
              <button className="btn btn-outline-primary" type="button" onClick={beginEdit}><Pencil size={15}/> Edit Draft</button>
              <button className="btn btn-primary" type="button" disabled={saving} onClick={confirmStatus}><Check size={15}/> Activate</button>
            </>}
            {canEdit && selected.status!=='draft' && <button className="btn btn-outline-primary" type="button" disabled={saving} onClick={cloneForEdit}><RotateCcw size={15}/> Clone Version</button>}
          </div>
        </header>
        <div className="vim-ac-v2-detail-tabs" role="tablist" aria-label="Workflow information">
          {[['steps','Workflow Steps'],['details','Details'],['versions','Version History']].map(([key,label])=><button type="button" role="tab" aria-selected={viewTab===key} className={viewTab===key?'active':''} key={key} onClick={()=>setViewTab(key)}>{label}</button>)}
        </div>
        {viewTab==='steps' && <div className="vim-ac-v2-timeline">
          {selected.levels.length?selected.levels.map((level,index)=><div className="vim-ac-v2-timeline-item" key={level.id??index}>
            <span className="vim-ac-v2-step-number">{index+1}</span>
            <div className="vim-ac-v2-step-body">
              <span className="vim-ac-v2-step-icon">{level.action==='publish'?<Workflow size={18}/>:level.action==='approve'?<Check size={19}/>:<ClipboardCheck size={18}/>}</span>
              <div className="vim-ac-v2-step-title"><strong>{display(level.name)}</strong>
                <div className="vim-ac-v2-step-tags"><span>{display(level.required_role_code)}</span><span>{display(level.action)}</span><span>{display(level.level)}</span></div>
                <small>{level.assigned_user?.name || (level.assigned_user_id ? `Assigned user #${level.assigned_user_id}` : 'Role-based assignment')}</small>
              </div>
              <span className={`vim-ac-v2-return-pill ${level.can_return?'allowed':''}`}>{level.can_return?'Can Return':'No Return'}</span>
            </div>
          </div>):<p className="vim-ac-v2-empty">No approval levels returned.</p>}
        </div>}
        {viewTab==='details'&&<div className="vim-ac-v2-metadata">
          <div><span>Workflow name</span><strong>{circleLabel(selected)}</strong></div>
          <div><span>Scope</span><strong>{scopeBadgeText(selected)}</strong></div>
          <div><span>Status</span>{statusBadge(selected)}</div>
          <div><span>Version</span><strong>v{selected.version_number??'—'}</strong></div>
          <div><span>Number of steps</span><strong>{selected.levels.length}</strong></div>
          <div><span>Updated At</span><strong>{formattedDate(selected.updated_at||selected.updatedAt)}</strong></div>
        </div>}
        {viewTab==='versions'&&<div className="vim-ac-v2-versions">
          {versionRows.map(row=><button type="button" key={row.id} onClick={()=>{showDetails(row);setViewTab('steps');}}>
            <strong>{circleLabel(row)} · Version {row.version_number??'—'}</strong>{statusBadge(row)}
            <small>{formattedDate(row.created_at || row.createdAt)}</small>
          </button>)}
          {!versionRows.length&&<p className="vim-ac-v2-empty">No versions returned for this scope.</p>}
        </div>}
      </>:<div className="vim-ac-v2-empty-detail"><Workflow size={27}/>
        <strong>Select an Approval Circle</strong><p>Select a row above to view its workflow steps and version history.</p></div>}
    </section>

    {editorOpen&&<aside className="vim-ac-v2-drawer" role="region" aria-label={mode==='edit'?'Edit draft workflow side panel':'Create new workflow side panel'}>
        <header><div><h2>{mode==='edit'?'Edit Draft Workflow':'Create New Workflow'}</h2><p>{mode==='edit'?'Update the draft before activation.':'Build an approval sequence for your authorized scope.'}</p></div>
          <button className="vim-ac-v2-close" type="button" onClick={closeEditor} aria-label="Close"><span>×</span></button></header>
        <div className="vim-ac-v2-drawer-scroll">
          <div className="vim-ac-v2-basics">
            <label>Workflow Name <b>*</b><input className={`form-control ${errors.name?'is-invalid':''}`} value={form.name} onChange={e=>change('name',e.target.value)} placeholder="e.g. Institutional Data Approval"/>
              {errors.name&&<small className="text-danger">{errors.name}</small>}</label>
            <label>Scope <span className="vim-ac-v2-readonly">{scopeCaption}</span></label>
          </div>
          <div className="vim-ac-v2-drawer-section-title"><h3>Workflow Steps <span>{form.levels.length}</span></h3><p>Review before approval. Steps follow this order.</p></div>
          <div className="vim-ac-v2-flow-list">
            {form.levels.map((level,index)=><div className="vim-ac-v2-flow-row" key={level.id??index}>
              <span className="vim-ac-v2-flow-number">{index+1}</span>
              <div className="vim-ac-v2-flow-main"><strong>{display(level.name)}</strong><small>{display(level.required_role_code)} · {display(level.action)}{level.assigned_user_id?` · User #${level.assigned_user_id}`:''}</small></div>
              <button type="button" title="Move up" disabled={index===0} onClick={()=>reorderLevel(index,-1)}><ArrowUp size={15}/></button>
              <button type="button" title="Move down" disabled={index===form.levels.length-1} onClick={()=>reorderLevel(index,1)}><ArrowDown size={15}/></button>
              <button type="button" title="Edit step" onClick={()=>{setLevelEditing(index);setLevelEditorKey(k=>k+1);}}><Pencil size={15}/></button>
              <button type="button" title="Remove step" className="danger" onClick={()=>{change('levels',form.levels.filter((_,i)=>i!==index));setLevelEditing(null);}}><Trash2 size={15}/></button>
            </div>)}
            {!form.levels.length&&<p className="vim-ac-v2-flow-empty">No steps yet. Add your first approval level.</p>}
          </div>
          {levelEditing!==null&&<LevelEditor key={levelEditorKey} users={users} usersLoading={usersLoading} usersError={optionsError}
            roleOptions={roleOptions} scope={scope} initial={levelEditing==='new'?null:form.levels[levelEditing]}
            onCancel={()=>setLevelEditing(null)} onApply={saveLevel}/>}
          <button type="button" className="vim-ac-v2-add-level" onClick={()=>{setLevelEditing('new');setLevelEditorKey(k=>k+1);}}><Plus size={16}/> Add Step</button>
          
          <p className="vim-ac-v2-help">The scope comes from your account. Institution workflows finish at Approve; ministry workflows include Publish. Submission creation and Draft belong to the Submission module, not approval steps.</p>
        </div>
        <footer><button className="btn btn-outline-secondary" type="button" onClick={closeEditor}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={saving || Boolean(levelEditing!==null)} onClick={save}>{saving?'Saving...':mode==='edit'?'Save Draft Changes':'Create Workflow'}</button></footer>
      </aside>}
    </div>

  </main>;
}
