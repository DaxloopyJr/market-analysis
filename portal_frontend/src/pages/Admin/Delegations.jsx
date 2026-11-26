import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/Admin/Delegations.jsx
 * ROUTE: /dashboard/administration/delegations
 * NAVIGATION: App.jsx -> ProtectedRoute -> DashboardLayout -> RouteAccess.
 * APPROVED UI REFERENCE: full bordered Delegations table + modal workflows:
 *   Add (4 steps), Edit, View Details, Revoke. NO two-panel layout.
 * DATA FLOW: Delegations.jsx -> API/delegations.jsx -> API/axios.jsx -> Laravel.
 * DROPDOWNS: users from GET /users, roles from GET /roles; departments and
 * institutions from their independently verified APIs (subject to grants).
 * SECURITY: roles.manage (MOA) plus Laravel authorization; delegator is
 * authenticated user, not an arbitrary client-supplied identity.
 * CONTRACT LIMIT: POST saves role, delegate, department scope, validity only.
 * Backend does NOT expose PUT, DELETE, attachments, title, notes, or
 * individual permission grants. UI-only reference fields never fake saves.
 */
import { TableLoader } from "../../components/common/LoadingState";
import {useEffect,useMemo,useState} from 'react';
import RowActionsMenu from "../../components/common/RowActionsMenu";
import {createPortal} from 'react-dom';
import {useOutletContext} from 'react-router-dom';
import Swal from "../../utils/portalAlerts";
import {AlertTriangle,CalendarDays,ChevronLeft,ChevronRight,Eye,Pencil,Plus,Search,ShieldCheck,Trash2,UserRound,X} from 'lucide-react';
import {listDelegations,createDelegation,revokeDelegation} from '../../API/delegations';
import {listUsers} from '../../API/users';
import {listRoles} from '../../API/roles';
import {listInstitutions} from '../../API/institution';
import {listDepartments} from '../../API/department';
import {apiError,validationErrors} from '../../API/resourceHelpers';
import {groupPermissions} from './permissionGrouping';
import {MuBadge, MuHeader, MuKpi, MuTabs} from '../../components/modern/ModernUI.jsx';
import {AdmOrg, AdmPerson} from '../../components/modern/AdminParts.jsx';
import {institutionLogoUrl} from '../../utils/institutionLogo.js';
import {countText} from '../../utils/adminDisplay.js';
import {ArrowLeftRight, CheckCircle2, Clock3, Ban} from 'lucide-react';
import '../../styles/admin-modern.css';
import './institutions.css';
import './delegations.css';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';

const newForm=()=>({title:'',delegate_user_id:'',role_id:'',department_id:'',institution_id:'',effective_from:'',effective_to:'',description:'',reason:'',conditions:''});
const printable=x=>x==null||x===''?'—':String(x);
const name=x=>typeof x==='string'?x:(x?.name||'—');
const formatDate=value=>value?String(value).slice(0,10):'—';

/** Read every returned backend page for option dropdowns, never hardcode IDs. */
async function allPages(fetchPage){
  const first=await fetchPage(1);
  if(first.lastPage>30) throw new Error('Too many options to list. Please narrow your search.');
  const items=[...first.items];
  for(let page=2;page<=first.lastPage;page++)items.push(...(await fetchPage(page)).items);
  return items;
}
function Dialog({title,onClose,children,wide=false}){
  return createPortal(<div className="vim-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className={`vim-dialog vim-dg-modal ${wide?'vim-dialog-wide':''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="vim-dialog-header"><h2>{title}</h2><button type="button" className="vim-icon-button" onClick={onClose} aria-label="Close dialog"><X size={17}/></button></header>
      {children}
    </div>
  </div>,document.body);
}
export default function Delegations(){
  const {user}=useOutletContext();
  const allowed=user?.permissions?.includes('roles.manage');
  const [records,setRecords]=useState([]);
  const [users,setUsers]=useState([]);
  const [roles,setRoles]=useState([]);
  const [departments,setDepartments]=useState([]);
  const [institutions,setInstitutions]=useState([]);
  const [loading,setLoading]=useState(true);
  const [optionsLoading,setOptionsLoading]=useState(false);
  const [error,setError]=useErrorDialogState('');
  const [optionsError,setOptionsError]=useErrorDialogState('');
  const [revision,setRevision]=useState(0);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('all');
  const [institutionFilter,setInstitutionFilter]=useState('all');
  const [departmentFilter,setDepartmentFilter]=useState('all');
  const [modal,setModal]=useState(null);
  const [current,setCurrent]=useState(null);
  const [step,setStep]=useState(0);
  const [editStep,setEditStep]=useState(0);
  const [form,setForm]=useState(newForm);
  const [reason,setReason]=useState('');
  const [fieldErrors,setFieldErrors]=useState({});
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(!allowed){setLoading(false);setError('Your account needs roles.manage permission.');return;}
    let alive=true;setLoading(true);setError('');
    listDelegations().then(result=>{if(alive)setRecords(result.items);})
      .catch(err=>{if(alive){setError(apiError(err));setRecords([]);}})
      .finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[allowed,revision]);

  useEffect(()=>{
    if(!allowed)return;
    let alive=true;
    setOptionsLoading(true);setOptionsError('');
    const jobs=[
      allPages(page=>listUsers({page})).then(items=>{if(alive)setUsers(items);}),
      listRoles().then(result=>{if(alive)setRoles(result.items);}),
      allPages(page=>listDepartments({page})).then(items=>{if(alive)setDepartments(items);}),
      allPages(page=>listInstitutions({page})).then(items=>{if(alive)setInstitutions(items);}),
    ];
    Promise.allSettled(jobs).then(results=>{
      if(!alive)return;
      const failed=results.filter(item=>item.status==='rejected');
      if(failed.length)setOptionsError(failed.map(item=>apiError(item.reason)).join(' '));
      setOptionsLoading(false);
    });
    return ()=>{alive=false;};
  },[allowed]);

  const filtered=useMemo(()=>records.filter(record=>{
    const searchable=[record.title,record.role?.name,record.delegator?.name,record.delegate?.name,record.department?.name].join(' ').toLowerCase();
    if(search&&!searchable.includes(search.toLowerCase()))return false;
    if(status!=='all'&&String(record.status).toLowerCase()!==status)return false;
    if(departmentFilter!=='all'&&String(record.department?.id)!==departmentFilter)return false;
    if(institutionFilter!=='all'&&String(record.institution?.id??record.department?.institution?.id??record.delegate?.institution?.id)!==institutionFilter)return false;
    return true;
  }),[records,search,status,departmentFilter,institutionFilter]);
  const [page,setPage]=useState(1);
  const byStatus=key=>records.filter(record=>String(record.status).toLowerCase()===key).length;
  const pickStatus=value=>{setStatus(value);setPage(1);};
  const stateTone=value=>({active:'green',revoked:'red',expired:'grey',scheduled:'amber',pending:'amber'})[String(value).toLowerCase()]||'grey';
  const [perPage,setPerPage]=usePageSize('delegations',10);
  const pages=Math.max(1,Math.ceil(filtered.length/perPage));
  const visible=filtered.slice((Math.min(page,pages)-1)*perPage,Math.min(page,pages)*perPage);
  const selectedRole=roles.find(role=>String(role.id)===String(form.role_id));
  const selectedDelegate=users.find(item=>String(item.id)===String(form.delegate_user_id));
  const grouped=groupPermissions(selectedRole?.permissions??[]);

  const close=()=>{if(!saving)setModal(null);};
  const beginAdd=()=>{setForm(newForm());setCurrent(null);setStep(0);setFieldErrors({});setModal('add');};
  const beginView=(record,mode)=>{setCurrent(record);setModal(mode);setEditStep(0);setReason('');};
  const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const continueWizard=()=>{
    if(step===0&&!form.delegate_user_id){setFieldErrors({delegate_user_id:'Select a user.'});return;}
    if(step===1&&!form.role_id){setFieldErrors({role_id:'Select a role.'});return;}
    if(step===2&&(!form.effective_from||(form.effective_to&&form.effective_to<form.effective_from))){
      setFieldErrors({dates:'Choose a start date and ensure end date is not earlier.'});return;
    }
    setFieldErrors({});setStep(currentStep=>Math.min(3,currentStep+1));
  };
  const submit=async()=>{
    if(!form.delegate_user_id||!form.role_id||!form.effective_from){setStep(0);setFieldErrors({form:'Select delegated user, role and start date.'});return;}
    if(String(form.delegate_user_id)===String(user?.id)){setStep(0);setFieldErrors({delegate_user_id:'Self-delegation is not allowed.'});return;}
    setSaving(true);
    try{
      const result=await createDelegation(form);
      await Swal.fire({icon:'success',title:'Delegation created',text:result.message||'Delegation saved.'});
      setModal(null);setRevision(n=>n+1);
    }catch(err){setFieldErrors({});await Swal.fire({icon:'error',title:'Delegation failed',text:apiError(err)});}
    finally{setSaving(false);}
  };
  const revoke=async()=>{
    if(!current?.id)return;
    setSaving(true);
    try{
      const result=await revokeDelegation(current.id);
      await Swal.fire({icon:'success',title:'Delegation revoked',text:result.message||'Delegation revoked.'});
      setModal(null);setRevision(n=>n+1);
    }catch(err){await Swal.fire({icon:'error',title:'Unable to revoke',text:apiError(err)});}
    finally{setSaving(false);}
  };

  const select=(key,value,options,placeholder)=> <select className="form-select" value={value} onChange={event=>update(key,event.target.value)}>
    <option value="">{placeholder}</option>
    {options.map(option=><option key={option.id} value={option.id}>{option.label??option.name}</option>)}
  </select>;
  return <main className="vim-institutions vim-delegations adm-modern container-fluid px-0">
    <MuHeader initials="⇆" title="Delegations" subtitle="Temporary delegation of approval and task responsibilities">
      {allowed&&<button className="mu-btn mu-btn-primary" type="button" onClick={beginAdd}><Plus size={16}/> Add Delegation</button>}
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<ArrowLeftRight size={18}/>} title="Delegations" value={countText(records.length,'delegation',loading)} note="in your scope" arrow={false} onOpen={()=>pickStatus('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={18}/>} title="Active" value={countText(byStatus('active'),'delegation',loading)} note="in effect" arrow={false} onOpen={()=>pickStatus('active')}/>
      <MuKpi tone="red" icon={<Ban size={18}/>} title="Revoked" value={countText(byStatus('revoked'),'delegation',loading)} note="stopped early" arrow={false} onOpen={()=>pickStatus('revoked')}/>
      <MuKpi tone="amber" icon={<Clock3 size={18}/>} title="Expired" value={countText(byStatus('expired'),'delegation',loading)} note="period ended" arrow={false} onOpen={()=>pickStatus('expired')}/>
    </div>
    <section className="vim-list-card">
      <header className="adm-card-head"><span className="adm-dot" aria-hidden="true"/><h2>Delegation records</h2><span className="mu-count">{loading?'…':filtered.length}</span></header>
      <div className="vim-dg-filters adm-toolbar">
        <MuTabs label="Status filter" value={status} onChange={pickStatus} items={[{key:'all',label:'All',count:records.length},{key:'active',label:'Active',count:byStatus('active')},{key:'revoked',label:'Revoked',count:byStatus('revoked')},{key:'expired',label:'Expired',count:byStatus('expired')}]}/>
        <select className="form-select" aria-label="Institution filter" value={institutionFilter} onChange={event=>{setInstitutionFilter(event.target.value);setPage(1);}}>
          <option value="all">All Institutions</option>{institutions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className="form-select" aria-label="Department filter" value={departmentFilter} onChange={event=>{setDepartmentFilter(event.target.value);setPage(1);}}>
          <option value="all">All Departments</option>{departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <label className="vim-search-field"><Search size={17}/><input placeholder="Search by role or user..." aria-label="Search delegations" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></label>
      </div>
      <div className="vim-table-scroll"><table className="table vim-table vim-dg-table mb-0"><thead><tr>
        <th>#</th><th>Delegation</th><th>From</th><th>To</th><th>Organisation</th><th>Start Date</th><th>End Date</th><th>Status</th><th aria-label="Actions"/>
      </tr></thead><tbody>
        {loading?<tr><td colSpan={9} className="text-center py-4">Loading delegations...</td></tr>:
         !visible.length?<tr><td colSpan={9} className="text-center py-4">No delegations returned.</td></tr>:
         visible.map((record,index)=><tr key={record.id}>
          <td>{(Math.min(page,pages)-1)*perPage+index+1}</td>
          <td><strong>{record.title||record.role?.name||`Role ${record.role?.code??''} delegation`}</strong></td>
          <td><AdmPerson name={name(record.delegator)} sub="delegating" seed={record.delegator?.id??name(record.delegator)}/></td>
          <td><AdmPerson name={name(record.delegate)} sub={printable(record.delegate?.email)} seed={record.delegate?.id??name(record.delegate)}/></td>
          <td>{(()=>{const org=record.institution??record.department?.institution??record.delegate?.institution;
            return org?<AdmOrg logo={institutionLogoUrl(org)} code={org.code||org.short_name||org.name} name={record.department?name(record.department):org.name}/>:printable(null);})()}</td>
          <td>{formatDate(record.effective_from)}</td><td>{formatDate(record.effective_to)}</td>
          <td><MuBadge tone={stateTone(record.status)}>{printable(record.status)}</MuBadge></td>
          <td className="mu-actions"><RowActionsMenu label="Row actions">
            <button title="View details" onClick={()=>beginView(record,'details')}><Eye size={15}/></button>
            <button title="Edit delegation (coming soon)" onClick={()=>beginView(record,'edit')}><Pencil size={15}/></button>
            <button title="Revoke delegation" className="vim-dg-danger" disabled={String(record.status).toLowerCase()!=='active'} onClick={()=>beginView(record,'revoke')}><Trash2 size={15}/></button>
          </RowActionsMenu></td>
        </tr>)}
      </tbody></table><TableLoader active={loading} /></div>
      <div className="vim-dg-pager"><span>Showing {visible.length?((Math.min(page,pages)-1)*perPage+1):0} to {Math.min(Math.min(page,pages)*perPage,filtered.length)} of {filtered.length} entries</span>
        <div><PageSizeSelect value={perPage} onChange={v=>{setPerPage(v);setPage(1);}}/><button disabled={page<=1} onClick={()=>setPage(x=>x-1)}><ChevronLeft size={16}/></button><span className="vim-dg-current-page">{Math.min(page,pages)}</span><button disabled={page>=pages} onClick={()=>setPage(x=>x+1)}><ChevronRight size={16}/></button></div>
      </div>
    </section>
    {modal==='add'&&<Dialog wide title="Add Delegation" onClose={close}>
      <div className="vim-dg-steps">{['Basic Information','Scope & Permissions','Validity Period','Additional Information'].map((label,index)=><button key={label} className={step===index?'selected':index<step?'completed':''} type="button" onClick={()=>{if(index<=step)setStep(index);}}><span>{index+1}</span> {label}</button>)}</div>
      <div className="vim-dg-modal-body">
        
        {step===0&&<div className="vim-dg-fields">
          <label>Delegation Name * <small>(coming soon)</small><input className="form-control" disabled placeholder="Shown from the delegated role" value={form.title}/></label>
          <div className="vim-dg-field-grid">
            <label>Delegating User *<input className="form-control" readOnly value={user?.name||'Authenticated user'} title="The delegator is the signed-in user"/><small>The signed-in user. Cannot be changed.</small></label>
            <label>Delegated User * {select('delegate_user_id',form.delegate_user_id,users.filter(u=>String(u.id)!==String(user?.id)).map(u=>({...u,label:`${u.name} (${u.email})`})),optionsLoading?'Loading users...':'Select delegated user...')}{fieldErrors.delegate_user_id&&<small className="text-danger">{fieldErrors.delegate_user_id}</small>}</label>
            <label>Institution <small>(Filter only)</small>{select('institution_id',form.institution_id,institutions,'Select institution...')}</label>
            <label>Ministry Department (optional) {select('department_id',form.department_id,departments,'Select department (optional)...')}</label>
          </div>
          <label>Description <small>(coming soon)</small><textarea className="form-control" disabled rows={3} value={form.description}/></label>
        </div>}
        {step===1&&<div className="vim-dg-fields">
          <h3>Select Modules and Permissions</h3>
          <label>Delegated Role *{select('role_id',form.role_id,roles,optionsLoading?'Loading roles...':'Select role...')}{fieldErrors.role_id&&<small className="text-danger">{fieldErrors.role_id}</small>}</label>
          <p className="text-muted small">The delegated user will receive the permissions of the selected role.</p>
          <div className="vim-dg-permissions">{grouped.length?grouped.map(group=><div key={group.title??group.name} className="vim-dg-permission-group">
            <strong><input type="checkbox" disabled checked readOnly/> {group.title??group.name}</strong>
            {(group.permissions??group.items??[]).map(p=><label key={p.id}><input type="checkbox" checked disabled readOnly/> {p.name??p.code}</label>)}
          </div>):<p>Select a role to display its permissions.</p>}</div>
        </div>}
        {step===2&&<div className="vim-dg-fields">
          <label>Start Date *<input type="date" className="form-control" value={form.effective_from} onChange={e=>update('effective_from',e.target.value)}/></label>
          <label>End Date (Optional)<input type="date" className="form-control" min={form.effective_from||undefined} value={form.effective_to} onChange={e=>update('effective_to',e.target.value)}/></label>
          <label>Duration<input className="form-control" disabled value={form.effective_to&&form.effective_from?`${Math.max(0,Math.round((new Date(form.effective_to)-new Date(form.effective_from))/86400000))} days`:'Open-ended / select end date'}/></label>
          <label>Delegation Type <input className="form-control" readOnly value="Role Delegation"/></label>
          <label>Allow Further Delegation <input className="form-control" disabled value="No"/></label>
          {fieldErrors.dates&&<p className="text-danger small">{fieldErrors.dates}</p>}
        </div>}
        {step===3&&<div className="vim-dg-fields">
          
          <label>Reason for Delegation<textarea className="form-control" disabled rows={2} placeholder="Currently unavailable"/></label>
          <label>Conditions / Remarks<textarea className="form-control" disabled rows={2} placeholder="Currently unavailable"/></label>
          <label>Attach Document (Optional)<input className="form-control" type="file" disabled title="Document attachments are not available yet"/></label>
        </div>}
      </div>
      <footer className="vim-dialog-footer">
        {step===0?<button className="btn btn-outline-secondary" onClick={close}>Cancel</button>:<button className="btn btn-outline-secondary" onClick={()=>setStep(x=>x-1)}>Back</button>}
        {step<3?<button className="btn btn-primary" onClick={continueWizard}>Next</button>:<button className="btn btn-primary" disabled={saving} onClick={submit}>{saving?'Saving...':'Save Delegation'}</button>}
      </footer>
    </Dialog>}
    {modal==='details'&&current&&<Dialog title="View Delegation Details" onClose={close} wide>
      <div className="vim-dg-details">
        <section><h3>Basic Information</h3>{[['Delegation Name',current.role?.name],['Delegating User',name(current.delegator)],['Delegated User',name(current.delegate)],['Institution',current.institution?.name??current.delegate?.institution?.name],['Department',current.department?.name],['Role',current.role?.name]].map(([key,value])=><div key={key}><span>{key}</span><strong>{printable(value)}</strong></div>)}</section>
        <section><h3>Validity Period</h3>{[['Start Date',formatDate(current.effective_from)],['End Date',formatDate(current.effective_to)],['Status',current.status]].map(([key,value])=><div key={key}><span>{key}</span><strong>{printable(value)}</strong></div>)}</section>
        <section><h3>Scope & Permissions</h3><p>Role: {name(current.role)}</p><p>Specific permissions depend on the assigned role returned.</p></section>
      </div><footer className="vim-dialog-footer"><button className="btn btn-outline-secondary" onClick={close}>Close</button></footer>
    </Dialog>}
    {modal==='edit'&&current&&<Dialog title="Edit Delegation" onClose={close} wide>
      <div className="vim-dg-steps">{['Basic Information','Scope & Permissions','Validity Period','Additional Information'].map((label,index)=><button key={label} type="button" className={editStep===index?'selected':''} onClick={()=>setEditStep(index)}><span>{index+1}</span> {label}</button>)}</div>
      <div className="vim-dg-modal-body">
        <p className="text-muted small">Editing this delegation is currently unavailable.</p>
        {editStep===0&&<div className="vim-dg-fields">
          <label>Delegation Name<input className="form-control" readOnly value={current.role?.name||''}/></label>
          <div className="vim-dg-field-grid">
            <label>Delegating User<input className="form-control" readOnly value={name(current.delegator)}/></label>
            <label>Delegated User<input className="form-control" readOnly value={name(current.delegate)}/></label>
            <label>Institution<input className="form-control" readOnly value={current.institution?.name||''}/></label>
            <label>Department<input className="form-control" readOnly value={name(current.department)}/></label>
          </div>
          <label>Description<textarea className="form-control" disabled rows={2}/></label>
        </div>}
        {editStep===1&&<div className="vim-dg-fields"><h3>Scope & Permissions</h3>
          <label>Delegated Role<input className="form-control" readOnly value={name(current.role)}/></label>
          <p className="small text-muted">Permission scope belongs to the role. Individual permissions cannot be edited from this delegation.</p>
        </div>}
        {editStep===2&&<div className="vim-dg-fields">
          <label>Start Date<input className="form-control" readOnly value={formatDate(current.effective_from)}/></label>
          <label>End Date<input className="form-control" readOnly value={formatDate(current.effective_to)}/></label>
          <label>Delegation Type<input className="form-control" readOnly value="Role Delegation"/></label>
        </div>}
        {editStep===3&&<div className="vim-dg-fields">
          <label>Reason for Delegation<textarea className="form-control" disabled rows={2}/></label>
          <label>Conditions / Remarks<textarea className="form-control" disabled rows={2}/></label>
          <label>Attach Document<input className="form-control" type="file" disabled/></label>
        </div>}
      </div>
      <footer className="vim-dialog-footer">
        <button className="btn btn-outline-secondary" onClick={()=>{if(editStep===0)close();else setEditStep(x=>x-1);}}>{editStep===0?'Cancel':'Back'}</button>
        {editStep<3?<button className="btn btn-primary" onClick={()=>setEditStep(x=>x+1)}>Next</button>:
          <button className="btn btn-primary" disabled title="PUT delegation endpoint not provided">Update Delegation</button>}
      </footer>
    </Dialog>}
    {modal==='revoke'&&current&&<Dialog title="Revoke Delegation" onClose={close}>
      <div className="vim-dg-modal-body"><div className="vim-dg-warning"><AlertTriangle size={23}/><span><strong>Are you sure you want to revoke this delegation?</strong><p>The delegated user will lose delegated role permissions immediately. This action cannot be undone.</p></span></div>
        <dl className="vim-dg-revoke-info"><dt>Delegation Role</dt><dd>{name(current.role)}</dd><dt>Delegating User</dt><dd>{name(current.delegator)}</dd><dt>Delegated User</dt><dd>{name(current.delegate)}</dd><dt>Validity</dt><dd>{formatDate(current.effective_from)} – {formatDate(current.effective_to)}</dd></dl>
        <label>Reason for Revocation * <small>(Backend reason field not available)</small><textarea className="form-control" disabled rows={2} placeholder="Revoke endpoint does not accept a reason"/></label>
      </div><footer className="vim-dialog-footer"><button className="btn btn-outline-secondary" onClick={close}>Cancel</button><button className="btn btn-danger" disabled={saving} onClick={revoke}>{saving?'Revoking...':'Revoke Delegation'}</button></footer>
    </Dialog>}
  </main>;
}
