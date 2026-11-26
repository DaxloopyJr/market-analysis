import {useErrorDialogState,showUserFacingError} from '../../utils/userFacingErrors.js';
/**
 * FILE: src/pages/ModulePage/Datasets.jsx
 * ROUTE: /dashboard/datasets; Sidebar: Dataset Management -> Datasets.
 * ACCESS: MOA / IA / IDO / DDO; actual dataset scope enforced by Laravel (scope D).
 * FLOW: page -> src/API/dataset.jsx -> src/API/axios.jsx -> remote /api/v1.
 * APPROVED REFERENCE: VIWANDA_DATASET_MANAGEMENT_UIUX_REVIEW(1).zip.
 * Three steps: Basic Information (including responsible officer) -> Indicators & Dimensions -> Review & Submit.
 * No Sections, no Input/Output Type, no client-written dataset code. Status/priority come from Laravel.
 * DRAFT/ACTIVATE: reopening creates NEW immutable template version; historical submissions remain unchanged.
 * TODO(BACKEND) Initial High priority: /datasets POST accepts no priority. Dataset write field is responsibleUserId. GET /assignees is READ ONLY.
 * OWNERSHIP: /me institutionId is always required. MOA chooses a ministry Department; DDO uses own
 *   departmentId; IA/IDO use own institutionId. Source Description stays free-text.
 * TODO(BACKEND): /me must expose the Ministry institutionId to MOA/DDO; never invent one.
 * GET /departments requires departments.manage; MOA is allowed, DDO uses own department.
 * TODO(BACKEND) Manual dimension OPTIONS are immutable on PATCH; versioned replace uses documented POST create + DELETE detach.
 * TODO(BACKEND) Per-indicator remarksMode persistence requires new verified field; browser preview is NOT server-persisted.
 * TODO(BACKEND) POST /datasets/{id}/draft does not explicitly confirm inactive -> draft; UI calls only this known route and reports Laravel rejection.
 * YEARLY REUSE: same dataset ID; Submission Periods creates/owns all dates, deadlines and reminders.
 * The existing reporting-calendar write needs reportingPeriodId + deadlineDays; until revised
 * contract is shared, the dedicated per-period calendar assignment remains separate.
 * GET /datasets/{id}/assignees is confirmed for scoped candidate read AFTER dataset creation.
 * Dataset POST/PATCH writes selected officer ID as `responsibleUserId` per backend field name.
 * Frontend re-reads GET /datasets/{id}; if responsibleUserId is null/mismatch, it does NOT claim success.
 * /users list may need users.manage; new drafts can fetch scoped candidates by dataset ID.
 * WIZARD STEPPER: saved stages show a green circle + white tick. For an existing
 * dataset, step headings navigate without forcing writes or validation; save and
 * activation remain separate Laravel operations. Unsaved indicator drafts survive
 * step changes in the same dialog. Active datasets need Reopen as Draft to edit.
 * NEXT-BUTTON FIX: validate visibly, save exactly once, advance on Laravel write success,
 * then refresh dependent data asynchronously (do NOT hold navigation for 7 API reads).
 * On refresh error, keep server-issued dataset ID to prevent accidental duplicate POST.
 * REVIEW: no visible configuration-progress panel or targets; historical template versions stay visible.
 * REFERENCE DATA: SECTOR and UNIT resolved by code -> GET /reference-data -> /values.
 * Do not hardcode sector/unit IDs or add unsupported Sections/Input-Output fields.
 */
import { TableLoader } from "../../components/common/LoadingState";
import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import RowActionsMenu from "../../components/common/RowActionsMenu";
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import Swal from "../../utils/portalAlerts";
import {
  Check, CheckCircle2, ChevronLeft, ChevronRight,
  CalendarClock, Database, Eye, Info, Pencil, Plus, RotateCcw,
  Search, Trash2, UserCheck, X,
} from 'lucide-react';
import { datasetsAPI as api, allDatasetOptions } from '../../API/dataset';
import { listDepartments } from '../../API/department';
import { getDatasetOwnership, roleCodes, userInstitutionId, userDepartmentId } from '../../utils/datasetOwnership';
import { savedResponsibleUserID, responsibleUserWriteFields } from '../../utils/datasetAssignees';
import { canNavigateDatasetStep, isDatasetDraft } from '../../utils/datasetWizardNavigation';
import { listUsers } from '../../API/users';
import { getActiveReferenceOptions } from '../../API/referenceData';
import { validateDatasetBasic, datasetUpdatePayload, datasetWizardCompletion } from './datasetFormRules';
import { apiError, validationErrors } from '../../API/resourceHelpers';
import { configuredRemarkMode, stageRemarkMode } from '../../utils/indicatorRemarks';
import {institutionLogoUrl} from '../../utils/institutionLogo.js';
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {MuCard, MuHeader, MuKpi, MuTabs} from '../../components/modern/ModernUI.jsx';
import {MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {ownOrg} from '../../utils/roleDisplay.js';
import '../Admin/institutions.css';
import './datasets.css';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const FREQUENCIES = ['daily','weekly','monthly','quarterly','semiannual','annual'];
const TYPES = ['integer','decimal','text','boolean','date'];
const AGGREGATIONS = ['none','sum','average','min','max','latest'];
const emptyForm = () => ({datasetName:'',description:'',institutionId:'',
  departmentId:'',sourceDescription:'',collectionMethod:'manual',sourceSystemName:'',
  frequencies:[],sectors:[],consumers:[]});
const emptyIndicator = () => ({nameEn:'',nameSw:'',descriptionEn:'',dataType:'integer',unitId:'',
  aggregationRule:'none',isRequired:true,displayOrder:1,hasDimension:false,
  dimensionName:'',dimensionNameSw:'',dimensionRequired:false,dimensionOptions:[''],
  performanceDirection:'higher_is_better',
  });
// Laravel performanceDirection: higher_is_better | lower_is_better | neutral (legacy higher/lower normalised).
const normalDirection = v => v==='lower'||v==='lower_is_better' ? 'lower_is_better' : v==='neutral' ? 'neutral' : 'higher_is_better';
const idString = v => v == null ? '' : String(v);
const pretty = v => v==null||v===''?'—':String(v);
const label = v => v ? String(v).charAt(0).toUpperCase()+String(v).slice(1) : '—';
const escapeSearch = v => String(v||'').toLowerCase();
const isActive = x => x?.status === 'active' || x?.is_active === true;
const errText = e => apiError(e);
const rowError = (fields,k) => fields[k] ? <small className="text-danger">{fields[k]}</small> : null;
const codeForOption = (name,index) => (name.trim().toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,82)||'OPTION')+'_'+(index+1);

function Dialog({title,subtitle,close,children}){
  useEffect(()=>{
    const listener=e=>{if(e.key==='Escape'&&!document.querySelector('.swal2-container')) close();};
    document.addEventListener('keydown',listener);
    return ()=>document.removeEventListener('keydown',listener);
  },[close]);
  return createPortal(<div className="vim-dialog-backdrop ds-backdrop" onMouseDown={e=>{
    if(e.target===e.currentTarget)close();
  }}><section className="vim-dialog ds-modal" role="dialog" aria-modal="true" aria-label={title}>
    <header className="vim-dialog-header ds-dialog-head"><span className="ds-dialog-icon" aria-hidden="true"><Database size={19}/></span>
      <div className="ds-dialog-titles"><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>
      <button className="vim-icon-button" aria-label="Close" onClick={close}><X size={17}/></button></header>
    {children}
  </section></div>,document.body);
}
// A broken server-backed Review should never blank the entire portal page.
// Keep the indicator editor mounted independently so unsaved drafts survive step clicks.
class DatasetReviewErrorBoundary extends Component {
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,details){console.error('VIWANDA dataset review rendering error',error,details);}
  render(){
    if(!this.state.error)return this.props.children;
    return <div className="ds-step-body" role="alert">
      <Banner tone="warning">The dataset review could not be displayed. Your saved dataset is still available. Return to Indicators & Dimensions, then try Review again.</Banner>
      <button type="button" className="btn btn-outline-primary btn-sm mt-2" onClick={this.props.onBack}><ChevronLeft size={15}/> Back to Indicators & Dimensions</button>
    </div>;
  }
}

function Field({title,required=false,children,hint,error}){
  return <div className="ds-field"><label className="ds-label">{title}{required&&<span className="ds-required"> *</span>}</label>
    {children}{hint&&<small className="ds-muted">{hint}</small>}{error&&<small className="text-danger">{error}</small>}</div>;
}
function Select({value='',onChange,options,placeholder='Select...',disabled=false}){
  return <select className="form-select form-select-sm" value={idString(value)} disabled={disabled} onChange={e=>onChange(e.target.value)}>
    <option value="">{placeholder}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
}
function Banner({children,tone='info'}){return <div className={`ds-banner ds-banner-${tone}`}><Info size={16}/><span>{children}</span></div>;}
function ConsumerPicker({selected,onChange,disabled=false}){
  const [q,setQ]=useState(''); const [options,setOptions]=useState([]);
  const [busy,setBusy]=useState(false); const [failure,setFailure]=useState('');
  useEffect(()=>{let active=true; const timer=setTimeout(()=>{
    setBusy(true);
    api.listConsumers({search:q,page:1,perPage:30}).then(data=>{
      if(active){setOptions(data.items);setFailure('');}
    }).catch(e=>{if(active){setFailure(errText(e));setOptions([]);}}).finally(()=>{if(active)setBusy(false);});
  },250);return()=>{active=false;clearTimeout(timer);};},[q]);
  const has=c=>selected.some(s=>c.id!=null?Number(s.id)===Number(c.id):s.name.toLowerCase()===c.name.toLowerCase());
  function add(c){if(!has(c))onChange([...selected,c]);setQ('');}
  return <div className="ds-consumer-picker">
    <div className="ds-tag-box">{selected.map((c,i)=><span key={c.id??`new-${i}`} className="ds-tag">{c.name}<button type="button" disabled={disabled} onClick={()=>onChange(selected.filter((_,j)=>j!==i))} aria-label={`Remove ${c.name}`}>×</button></span>)}
      <input disabled={disabled} aria-label="Search or enter a consumer" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search or add consumer..."/>
    </div>
    {q.trim()&&<div className="ds-suggestions">
      {busy&&<div className="ds-muted p-2">Searching...</div>}
      {!busy&&options.filter(c=>!has(c)).map(c=><button key={c.id} type="button" onClick={()=>add({id:c.id,name:c.name,shortName:c.shortName})}>{c.name}{c.shortName&&<small> ({c.shortName})</small>}</button>)}
      {!busy&&!has({name:q.trim()})&&<button type="button" onClick={()=>add({name:q.trim(),shortName:''})}>+ Add new consumer: <b>{q.trim()}</b></button>}
    </div>}
    {failure&&<small className="text-danger">Could not load suggestions: {failure}. You can still enter a new name.</small>}
  </div>;
}

/** Role-scoped dataset details: visual layout only; dataset ownership remains enforced by API.
 * Officer choice is a UI selection until a valid reporting calendar assignment exists. */
/** PATCH body for sectors, same shape as POST /datasets. */
function sectorWritePayload(list=[]){
  return (list||[]).filter(s=>s?.sectorId).map(s=>({sectorId:Number(s.sectorId),subsectorIds:(s.subsectorIds||[]).map(Number).sort((a,b)=>a-b)}));
}
/** Laravel read-back: GET /datasets/{id} sectorIds + subsectorIds must equal the form. */
function sectorsMatch(record,list=[]){
  const wantSectors=sectorWritePayload(list).map(s=>s.sectorId).sort((a,b)=>a-b);
  const wantSubs=sectorWritePayload(list).flatMap(s=>s.subsectorIds).sort((a,b)=>a-b);
  const gotSectors=(record?.sectorIds||[]).map(Number).sort((a,b)=>a-b);
  const gotSubs=(record?.subsectorIds||[]).map(Number).sort((a,b)=>a-b);
  return JSON.stringify(wantSectors)===JSON.stringify(gotSectors)&&JSON.stringify(wantSubs)===JSON.stringify(gotSubs);
}
function BasicStep({form,setForm,sectors,sectorError,departments,departmentError,
  errors,user,officers,scopedAssignees,officerError,selectedOfficer,setSelectedOfficer,locked=false,readOnly=false}){
  const change=(key,value)=>setForm(old=>({...old,[key]:value}));
  const ownership=getDatasetOwnership(user);
  const selectedSector=form.sectors[0]?.sectorId??'';
  const subs=sectors.filter(v=>idString(v.parentId)===idString(selectedSector));
  const top=sectors.filter(v=>v.parentId==null);
  const ministry=ownership.kind==='ministry';
  const myOfficerRole=roleCodes(user).some(r=>r==='IDO'||r==='DDO');
  const availableOfficers=officers.filter(o=>{
    const roles=roleCodes(o);
    const institution=userInstitutionId(o);
    const department=userDepartmentId(o);
    // eligible-officers rows are already filtered by Laravel (no roles/status in payload).
    return (o.eligible || (isActive(o) && roles.some(r=>ministry?r==='DDO':r==='IDO'))) &&
      institution!=null && Number(institution)===Number(form.institutionId) &&
      (!ministry||!form.departmentId||department==null||Number(department)===Number(form.departmentId));
  });
  // Scoped GET /assignees can return id/name/email only (no roles/status).
  // It is dataset-scoped at Laravel; do not re-filter by missing role metadata.
  const officerOptions=[...scopedAssignees,...availableOfficers.filter(o=>!scopedAssignees.some(a=>idString(a.id)===idString(o.id)))];
  if(myOfficerRole && user?.id && !officerOptions.some(o=>String(o.id)===String(user.id)))officerOptions.unshift(user);
  if(selectedOfficer && !officerOptions.some(o=>idString(o.id)===idString(selectedOfficer)))
    officerOptions.unshift({id:selectedOfficer,name:`Currently assigned officer #${selectedOfficer} (profile unavailable)`});
  const selfAssigned=myOfficerRole&&Boolean(user?.id)&&idString(selectedOfficer)===idString(user.id);
  const institutionName=user?.institution?.name||user?.institution?.institutionName||user?.institution_name||
    (form.institutionId?`Institution #${form.institutionId}`:'Institution unavailable');
  const selectedDepartment=departments.find(d=>idString(d.id)===idString(form.departmentId));
  const institutionLogo=institutionLogoUrl(user?.institution);
  return <div className="ds-step-body ds-basic-clean">
    {ownership.error&&<Banner tone="warning">{ownership.error}</Banner>}
    <div className="ds-basic-split"><section className="ds-card">
    <div className="ds-basic-heading"><div className="ds-section-glyph"><Database size={18}/></div>
      <div><h3>Dataset Information</h3><p>Enter the essential details for this dataset.</p></div></div>
    <div className="ds-institution-card">
      <div className="ds-institution-symbol">{institutionLogo?<img src={institutionLogo} alt=""/>:<Database size={19} aria-hidden="true"/>}</div>
      <div><span className="ds-label">Institution</span><strong>{institutionName}</strong></div>
      <span className="ds-autofill-tag">Auto-filled</span>
    </div>
    <div className="ds-basic-grid">
      <Field title="Dataset Name" required error={rowError(errors,'datasetName')}><input className="form-control form-control-sm" value={form.datasetName} disabled={readOnly} onChange={e=>change('datasetName',e.target.value)} placeholder="Enter dataset name" maxLength={255}/></Field>
      <Field title="Sector" required error={rowError(errors,'sectors')}><Select value={selectedSector} onChange={v=>change('sectors',v?[{sectorId:Number(v),subsectorIds:[]}]:[])} options={top.map(x=>({value:x.id,label:x.label}))} placeholder={sectorError?'Unable to load sectors':'Select sector'} disabled={Boolean(sectorError)||readOnly}/></Field>
      <Field title="Description" required error={rowError(errors,'description')}><textarea rows={3} className="form-control form-control-sm" value={form.description} disabled={readOnly} onChange={e=>change('description',e.target.value)} placeholder="Briefly describe the information this dataset collects"/></Field>
      {selectedSector && subs.length > 0 && <div className="ds-subsector-group"><Field title="Subsector"><select multiple className="form-select form-select-sm ds-multi" value={(form.sectors[0]?.subsectorIds||[]).map(String)} onChange={e=>change('sectors',[{sectorId:Number(selectedSector),subsectorIds:Array.from(e.target.selectedOptions).map(v=>Number(v.value))}])} disabled={!selectedSector||!subs.length||readOnly} aria-label="Select subsectors">{subs.length?subs.map(x=><option key={x.id} value={x.id}>{x.label}</option>):<option disabled value="">Choose a sector first</option>}</select></Field></div>}
      <Field title="Data Source" required error={rowError(errors,'sourceDescription')}><input className="form-control form-control-sm" value={form.sourceDescription} disabled={readOnly} onChange={e=>change('sourceDescription',e.target.value)} placeholder="e.g. Human Resources Unit"/></Field>
      {ministry?<Field title="Ministry Department" required error={rowError(errors,'departmentId')}>
        {ownership.canChooseDepartment?<Select value={form.departmentId} onChange={v=>change('departmentId',v)} options={departments.filter(d=>d.status!=='inactive'&&d.is_active!==false).map(d=>({value:d.id,label:`${d.name}${d.code?` (${d.code})`:''}`}))} placeholder="Select department" disabled={locked||Boolean(departmentError)}/>
          :<input className="form-control form-control-sm ds-readonly" readOnly value={user?.department?.name||selectedDepartment?.name||`Department #${form.departmentId||'—'}`}/>}
        
      </Field>:null}
      <Field title="Consumers" required error={rowError(errors,'consumers')}><ConsumerPicker selected={form.consumers} onChange={v=>change('consumers',v)} disabled={readOnly}/></Field>
    </div></section>
    <div className="ds-basic-side">
      <section className="ds-card"><div className="ds-card-head"><span className="ds-dot" aria-hidden="true"/><h3>Data Collection</h3></div>
      <div className={`ds-method-frequency ${form.collectionMethod==='system'?'ds-method-frequency-system':''}`}>
        <Field title="Dataset Method" required><div className="ds-method-choices" role="radiogroup" aria-label="Dataset Method">
          {[{value:'manual',label:'Manual'},{value:'system',label:'System'}].map(x=><label key={x.value} className={`ds-method-choice ${form.collectionMethod===x.value?'is-selected':''}`}><input type="radio" name="ds-method" disabled={readOnly} checked={form.collectionMethod===x.value} onChange={()=>change('collectionMethod',x.value)}/><span><b>{x.label}</b><small>{x.value==='manual'?'officers type values':'fed by an integration'}</small></span></label>)}
        </div></Field>
        {form.collectionMethod==='system'&&<Field title="Source System Name" required error={rowError(errors,'sourceSystemName')}><input className="form-control form-control-sm" value={form.sourceSystemName} onChange={e=>change('sourceSystemName',e.target.value)} placeholder="Enter source system name" disabled={readOnly}/></Field>}
        <Field title="Reporting Frequency" required error={rowError(errors,'frequencies')}><div className="ds-frequency-choices">{FREQUENCIES.map(f=><label key={f} className={`ds-frequency-choice ${form.frequencies.includes(f)?'is-selected':''}`}><input type="checkbox" disabled={readOnly} checked={form.frequencies.includes(f)} onChange={e=>change('frequencies',e.target.checked?[...form.frequencies,f]:form.frequencies.filter(x=>x!==f))}/>{form.frequencies.includes(f)&&<Check size={13} strokeWidth={3} aria-hidden="true"/>}{label(f)}</label>)}</div></Field>
      </div></section>
      <section className="ds-card"><div className="ds-card-head"><span className="ds-dot" aria-hidden="true"/><h3>Responsible Officer</h3></div>
      <div className="ds-officer-group"><Field title="Responsible IDO/DDO" required error={errors.responsibleUserId}>
        <div className="ds-officer-controls"><Select value={selectedOfficer} onChange={setSelectedOfficer}
          disabled={readOnly} options={officerOptions.map(o=>({value:o.id,label:`${o.name||[o.first_name,o.last_name].filter(Boolean).join(' ')}${roleCodes(o).length?` (${roleCodes(o).join('/')})`:o.email?` (${o.email})`:''}`}))}
          placeholder="Select responsible officer"/>
          <label className="ds-self-assign"><input type="checkbox" checked={selfAssigned} disabled={readOnly||!myOfficerRole} onChange={e=>setSelectedOfficer(e.target.checked?idString(user.id):'')}/> Assign Myself</label>
        </div>
      </Field>
        <small className="ds-muted">{locked?'Choose the officer responsible for this dataset.':'New dataset: pick an officer if available; otherwise save a draft to load its dataset-scoped assignees.'}</small></div>
      </section>
    </div></div>
  </div>;
}

const emptyDimensionDraft = (order=1) => ({
  key:`new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  dimensionId:null,nameEn:'',nameSw:'',isRequired:false,displayOrder:order,
  options:[''],original:null,
});
function attachedDimensions(dimensions,id){
  return dimensions.filter(d=>{
    const ids=d.indicatorIds ?? d.indicator_ids ?? [];
    return Array.isArray(ids) && ids.some(v=>Number(v?.id ?? v?.indicatorId ?? v)===Number(id));
  });
}
// GET /datasets/{id}/dimensions can omit option definitions. That is NOT the
// same as an empty option list, and must never trigger destructive replacement.
function returnedDimensionOptions(dim){
  const rows=dim?.dimension?.options ?? dim?.options;
  return Array.isArray(rows)?rows:null;
}
function dimensionOptions(dim){
  const rows=returnedDimensionOptions(dim);
  return (rows||[]).map(option=>typeof option==='string'?option:
    String(option?.nameEn ?? option?.name_en ?? option?.label ?? option?.name ?? '')).filter(Boolean);
}
function dimensionDraft(dim){
  const id=dim.dimensionId ?? dim.dimension_id ?? dim.dimension?.id;
  return {
    key:`existing-${id}`,dimensionId:id, nameEn:dim.dimension?.nameEn ?? dim.dimension?.name_en ?? '',
    nameSw:dim.dimension?.nameSw ?? dim.dimension?.name_sw ?? '',
    isRequired:Boolean(dim.isRequired ?? dim.is_required),
    displayOrder:dim.displayOrder ?? dim.display_order ?? 1,
    options:dimensionOptions(dim),optionsAvailable:returnedDimensionOptions(dim)!==null,original:dim,
  };
}

const IndicatorsStep = forwardRef(function IndicatorsStep({dataset,indicators,setIndicators,dimensions,setDimensions,units,notify,editable,onConfigurationChange},ref){
  const [form,setForm]=useState(emptyIndicator());
  const [editId,setEditId]=useState(null);
  const [dimensionDrafts,setDimensionDrafts]=useState([]);
  const [remarksMode,setRemarksMode]=useState('optional');
  const [remarksEdited,setRemarksEdited]=useState(false);
  const [busy,setBusy]=useState(false);
  const [fieldErrors,setFieldErrors]=useState({});
  const [dirty,setDirty]=useState(false);
  const update=(key,value)=>{setDirty(true);setForm(o=>({...o,[key]:value}));};
  const updateDimension=(key,patch)=>{setDirty(true);setDimensionDrafts(rows=>rows.map(d=>d.key===key?{...d,...patch}:d));};
  // The indicator form opens only after "Add Indicator" or Edit (5 Nov 2026).
  const [formOpen,setFormOpen]=useState(false);
  const reset=()=>{setFormOpen(false);setEditId(null);setForm(emptyIndicator());setDimensionDrafts([]);setRemarksMode('optional');setRemarksEdited(false);setDirty(false);setFieldErrors({});};
  const filteredRules=(form.dataType==='text'||form.dataType==='boolean')?['none','latest'] : form.dataType==='date'?['none','min','max','latest']:AGGREGATIONS;
  const numeric=['integer','decimal'].includes(form.dataType);
  function prepareEdit(row){
    const id=row.indicatorId ?? row.indicator_id;
    setEditId(id);setFormOpen(true);setDirty(false);setRemarksEdited(false);setFieldErrors({});
    setForm({...emptyIndicator(),nameEn:row.indicator?.nameEn||'',nameSw:row.indicator?.nameSw||'',
      descriptionEn:row.indicator?.descriptionEn||'',dataType:row.indicator?.dataType||'integer',
      unitId:row.indicator?.unitId||'',aggregationRule:row.indicator?.aggregationRule||'none',
      isRequired:Boolean(row.isRequired),displayOrder:row.displayOrder||1,
      performanceDirection:normalDirection(row.indicator?.performanceDirection)});
    setDimensionDrafts(attachedDimensions(dimensions,id).map(dimensionDraft));
    setRemarksMode(configuredRemarkMode(row,dataset.id,id));
  }
  async function refresh(){
    const [inds,dims]=await Promise.all([allDatasetOptions(p=>api.indicators(dataset.id,{page:p,perPage:100})),allDatasetOptions(p=>api.dimensions(dataset.id,{page:p,perPage:100}))]);
    setIndicators(inds);setDimensions(dims);
  }
  const makeDimensionPayload=(indicatorId,d)=>({dimension:{
    // New catalogue code keeps historical dimension versions untouched; never update option rows in place.
    dimensionCode:`DS${dataset.id}_IND${indicatorId}_${codeForOption(d.nameEn,0)}_${Date.now().toString(36)}`.slice(0,100),
    nameEn:d.nameEn.trim(),nameSw:d.nameSw.trim()||null,dataType:'reference',referenceTypeId:null,
    options:d.options.map(x=>x.trim()).filter(Boolean).map((name,i)=>({code:codeForOption(name,i),nameEn:name})),
  },indicatorIds:[Number(indicatorId)],isRequired:Boolean(d.isRequired),displayOrder:Number(d.displayOrder)});
  async function saveDimensions(indicatorId){
    const current=attachedDimensions(dimensions,indicatorId);
    // Validate all new/replacement categories before writing any of them.
    for(const d of dimensionDrafts){
      const original=d.original;
      const oldOpts=original?dimensionOptions(original):[];
      const newOpts=d.options.map(x=>x.trim()).filter(Boolean);
      if(!original || (d.optionsAvailable && JSON.stringify(oldOpts)!==JSON.stringify(newOpts))){
        // Versioned replacement using only verified create/detach operations.
        // Create BEFORE detach. If Laravel disallows multiple temporary attachments,
        // report the failure and leave the original intact.
        const created=await api.addDimension(dataset.id,makeDimensionPayload(indicatorId,d));
        const newId=created.data?.dimensionId ?? created.data?.dimension?.id ?? created.data?.id;
        if(original){
          try{await api.detachDimension(dataset.id,d.dimensionId);}
          catch(error){
            if(newId)await api.detachDimension(dataset.id,newId).catch(()=>{});
            throw error;
          }
        }
      } else {
        const nameChanged=d.nameEn.trim()!==(original.dimension?.nameEn||'') || d.nameSw.trim()!==(original.dimension?.nameSw||'');
        const attachedChanged=Boolean(d.isRequired)!==Boolean(original.isRequired) || Number(d.displayOrder)!==Number(original.displayOrder);
        if(nameChanged)await api.updateCatalogueDimension(d.dimensionId,{nameEn:d.nameEn.trim(),nameSw:d.nameSw.trim()||null});
        if(attachedChanged)await api.updateDimensionAttachment(dataset.id,d.dimensionId,{isRequired:Boolean(d.isRequired),displayOrder:Number(d.displayOrder)});
      }
    }
    // Detach removed categories LAST after all remaining ones were created/updated.
    for(const old of current){
      if(!dimensionDrafts.some(d=>String(d.dimensionId)===String(old.dimensionId)))await api.detachDimension(dataset.id,old.dimensionId);
    }
  }
  async function save(e){
    e?.preventDefault();if(busy||!editable)return false;
    const validation={};
    if(!form.nameEn.trim())validation.nameEn='Indicator name is required.';
    if(!TYPES.includes(form.dataType))validation.dataType='Select a valid data type.';
    const names=new Set();
    for(const d of dimensionDrafts){
      if(!d.nameEn.trim()){validation.dimensions='Every dimension category needs a name.';break;}
      const norm=d.nameEn.trim().toLowerCase();
      if(names.has(norm)){validation.dimensions='Dimension category names must be unique per indicator.';break;}names.add(norm);
      // If Laravel omitted an existing category's options, preserve them on the
      // server and allow changes to its name / required flag / display order.
      if(!d.original || d.optionsAvailable){
        if(!d.options.some(o=>o.trim())){validation.dimensions=`${d.nameEn}: add at least one option.`;break;}
        const opts=d.options.map(o=>o.trim().toLowerCase()).filter(Boolean);
        if(new Set(opts).size!==opts.length){validation.dimensions=`${d.nameEn}: duplicate options are not allowed.`;break;}
      }
    }
    setFieldErrors(validation);if(Object.keys(validation).length)return false;
    const replacingOptions=dimensionDrafts.filter(d=>d.original && d.optionsAvailable && JSON.stringify(dimensionOptions(d.original)) !== JSON.stringify(d.options.map(x=>x.trim()).filter(Boolean)));
    if(replacingOptions.length){
      const answer=await Swal.fire({title:'Replace dimension options?',
        text:'Changing the options creates a new version of this dimension and removes the old one. Continue?',
        icon:'warning',showCancelButton:true,confirmButtonText:'Replace in Draft'});
      if(!answer.isConfirmed)return false;
    }
    setBusy(true);let savedIndicatorId=editId;let indicatorWritten=false;
    try{
      if(editId){
        const existing=indicators.find(i=>Number(i.indicatorId)===Number(editId));
        const definition=existing?.indicator||{};
        const directionChanged=form.performanceDirection!==normalDirection(definition.performanceDirection);
        const changed=directionChanged||['nameEn','nameSw','descriptionEn','dataType','unitId','aggregationRule'].some(key =>
          String(form[key]||'')!==String(definition[key]||''));
        if(changed)await api.updateCatalogueIndicator(editId,{
          nameEn:form.nameEn.trim(),nameSw:form.nameSw.trim()||null,descriptionEn:form.descriptionEn.trim()||null,
          dataType:form.dataType,unitId:numeric&&form.unitId?Number(form.unitId):null,aggregationRule:form.aggregationRule,
          // PATCH omission preserves the saved direction; only send it when changed.
          ...(directionChanged?{performanceDirection:form.performanceDirection}:{}),
        });
        if(Boolean(form.isRequired)!==Boolean(existing?.isRequired) || Number(form.displayOrder)!==Number(existing?.displayOrder))
          await api.changeIndicatorAttachment(dataset.id,editId,{isRequired:form.isRequired,displayOrder:Number(form.displayOrder)});
        indicatorWritten=true;
      } else {
        const created=await api.addIndicator(dataset.id,{indicator:{
          nameEn:form.nameEn.trim(),nameSw:form.nameSw.trim()||null,descriptionEn:form.descriptionEn.trim()||null,
          dataType:form.dataType,unitId:numeric&&form.unitId?Number(form.unitId):null,aggregationRule:form.aggregationRule,
          performanceDirection:form.performanceDirection,
        },isRequired:form.isRequired,displayOrder:Number(form.displayOrder)});
        savedIndicatorId=created.data?.indicatorId??created.data?.indicator?.id;
        if(!savedIndicatorId)throw new Error('Indicator was created, but the system did not return an indicator ID. Reload before adding dimensions.');
        indicatorWritten=true;
      }
      await saveDimensions(savedIndicatorId);
      // Remarks writes are not in the confirmed API contract. Do not describe
      // them as server-saved. Only flag the limitation when the user edited it.
      const remarksPreviewOnly=remarksEdited;
      stageRemarkMode(dataset.id,savedIndicatorId,remarksMode);
      await refresh();void onConfigurationChange(dataset.id);reset();
      void Swal.fire({toast:true,position:'top-end',timer:5000,showConfirmButton:false,
        icon:remarksPreviewOnly?'warning':'success',
        title:remarksPreviewOnly
          ? 'Indicator and dimensions saved. The Remarks setting is not saved yet.'
          : 'Indicator and dimensions saved.'});
      return true;
    }catch(err){
      await refresh().catch(()=>{});
      if(indicatorWritten){
        setEditId(savedIndicatorId);setDirty(true);
        void showUserFacingError(err,'Dimension configuration not completed');
      } else void showUserFacingError(err);
      setFieldErrors({});return false;
    }finally{setBusy(false);}
  }
  useImperativeHandle(ref,()=>({saveAndNext:async()=>{
    if(!editable&&dataset?.status!=='active')return false;
    if(dirty)return save();
    if(indicators.some(i=>i?.indicatorId||i?.indicator?.id))return true;
    void notify('warning','Add and save at least one indicator before continuing.');return false;
  }}));
  async function detach(row){
    const answer=await Swal.fire({title:'Detach indicator?',text:'Remove the indicator and its attached dimensions from this dataset? Catalogue records will remain.',showCancelButton:true,confirmButtonText:'Detach',icon:'warning'});
    if(!answer.isConfirmed)return;
    setBusy(true);
    try{
      for(const dim of attachedDimensions(dimensions,row.indicatorId))await api.detachDimension(dataset.id,dim.dimensionId);
      const res=await api.detachIndicator(dataset.id,row.indicatorId);
      await refresh();void onConfigurationChange(dataset.id);reset();await notify('success',res.message||'Indicator detached.');
    }catch(err){await refresh().catch(()=>{});await showUserFacingError(err);}finally{setBusy(false);}
  }
  return <div className="ds-step-body"><h3>Indicators & Dimensions</h3>
    <p className="ds-muted">Each indicator can have multiple independent dimension categories, e.g. By Gender and By Role.</p>
    <div className={`ds-ind-layout${formOpen?'':' is-list-only'}`}><div className="ds-subcard">
      <div className="ds-row-between"><h4><span className="ds-dot" aria-hidden="true"/>Dataset Indicators <span className="ds-count">{indicators.length}</span></h4>
        <button type="button" className="btn btn-link btn-sm ds-link-btn" disabled={!editable} onClick={()=>{reset();setForm({...emptyIndicator(),displayOrder:indicators.length+1});setFormOpen(true);}}><Plus size={14}/> Add Indicator</button></div>
      <div className="ds-ind-list" role="list">
      {indicators.map((row,i)=>{const dims=attachedDimensions(dimensions,row.indicatorId),open=String(editId)===String(row.indicatorId);
        return <div role="listitem" key={row.id||row.indicatorId} className={`ds-ind-item ${open?'is-open':''}`}>
        <span className="ds-ind-no">{i+1}</span>
        <div className="ds-ind-text"><strong>{row.indicator?.nameEn||'—'}</strong>
          <div className="ds-dimension-tags"><span className="ds-status ds-blue">{label(row.indicator?.dataType)}</span>
            {dims.map(d=><span className="ds-status ds-violet" key={d.dimensionId}>{d.dimension?.nameEn||'Dimension'}</span>)}
            <span className={`ds-status ${row.isRequired?'ds-yellow':'ds-grey'}`}>{row.isRequired?'Required':'Optional'}</span></div></div>
        <RowActionsMenu label="Row actions">
          <button type="button" title="Edit Indicator & Dimensions" onClick={()=>prepareEdit(row)} disabled={!editable}><Pencil size={15}/></button>
          <button type="button" className="ds-red-button" title="Detach" onClick={()=>detach(row)} disabled={!editable||busy}><Trash2 size={15}/></button>
        </RowActionsMenu></div>;})}
      {!indicators.length&&<p className="ds-dimension-empty">No indicators yet. Add one after saving Basic Information.</p>}
      </div></div>
      {formOpen&&<form onSubmit={save} className="ds-subcard ds-indicator-config"><h4><span className="ds-dot" aria-hidden="true"/>{editId?`Edit Indicator — ${form.nameEn||'Indicator'}`:'Add Indicator'}{dirty&&<span className="ds-unsaved">Unsaved changes</span>}</h4>
        {!editable&&<Banner tone="warning">Reopen the dataset as Draft before editing.</Banner>}
        <div className="ds-grid">
          <div className="ds-span2"><Field title="Indicator Name (English)" required error={fieldErrors.nameEn}><input className="form-control form-control-sm" value={form.nameEn} onChange={e=>update('nameEn',e.target.value)} disabled={!editable}/></Field></div>
          <Field title="Data Type" required><Select value={form.dataType} disabled={!editable} onChange={v=>{update('dataType',v);update('aggregationRule','none');}} options={TYPES.map(x=>({value:x,label:x}))}/></Field>
          <Field title="Unit (numeric only)"><Select value={form.unitId} onChange={v=>update('unitId',v)} disabled={!editable||!numeric} options={units.map(x=>({value:x.id,label:x.label}))} placeholder="Optional unit"/></Field>
          <Field title="Required"><Select value={form.isRequired?'yes':'no'} onChange={v=>update('isRequired',v==='yes')} disabled={!editable} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}/></Field>
          <Field title="Aggregation"><Select value={form.aggregationRule} onChange={v=>update('aggregationRule',v)} disabled={!editable} options={filteredRules.map(x=>({value:x,label:x}))}/></Field>
          <div className="ds-span2"><Field title="Performance direction" hint="Higher is better: more is good (e.g. trainees). Lower is better: less is good (e.g. cost, accidents).">
            <div className="ds-direction" role="radiogroup" aria-label="Performance direction">
              {[{value:'higher',title:'Higher is better',note:'e.g. farmers trained, revenue'},{value:'lower',title:'Lower is better',note:'e.g. complaints, accidents (target 0)'}].map(x=>
                <label key={x.value} className={`ds-direction-choice ${form.performanceDirection===`${x.value}_is_better`?'is-selected':''}`}><input type="radio" name="ds-direction" disabled={!editable} checked={form.performanceDirection===`${x.value}_is_better`} onChange={()=>update('performanceDirection',`${x.value}_is_better`)}/>
                  <span><b>{x.value==='higher'?'▲':'▼'} {x.title}</b><small>{x.note}</small></span></label>)}
            </div></Field></div>
          <Field title="Display Order"><input type="number" min="1" className="form-control form-control-sm" value={form.displayOrder} onChange={e=>update('displayOrder',e.target.value)} disabled={!editable}/></Field>
          <Field title="Remarks (per indicator)" hint="Hidden / Optional / Required controls what Data Entry displays.">
            <Select disabled={!editable} value={remarksMode} onChange={v=>{setRemarksMode(v);setRemarksEdited(true);setDirty(true);}} options={[{value:'hidden',label:'Hidden'},{value:'optional',label:'Optional'},{value:'required',label:'Required'}]}/></Field>
          <div className="ds-span2"><Field title="Indicator Description (English)"><textarea className="form-control form-control-sm" rows={2} value={form.descriptionEn} onChange={e=>update('descriptionEn',e.target.value)} disabled={!editable}/></Field></div>
          <div className="ds-span2 ds-dimension-manager">
            <div className="ds-row-between"><div><h4>Dimension Categories ({dimensionDrafts.length})</h4><small className="ds-muted">Add separate breakdowns such as By Gender (Male, Female) and By Role (Academic, Administrative).</small></div>
              <button type="button" className="btn btn-outline-primary btn-sm" disabled={!editable} onClick={()=>{setDirty(true);setDimensionDrafts(rows=>[...rows,emptyDimensionDraft(rows.length+1)]);}}><Plus size={14}/> Add Dimension Category</button></div>
            {fieldErrors.dimensions&&<small className="text-danger">{fieldErrors.dimensions}</small>}
            {!dimensionDrafts.length&&<div className="ds-dimension-empty">No dimensions configured — indicator will collect a single current value.</div>}
            {dimensionDrafts.map((d,i)=><div className="ds-category-card" key={d.key}>
              <div className="ds-row-between"><strong>Category {i+1} {d.dimensionId&&<span className="ds-status ds-blue">Existing</span>}</strong>
                <button type="button" className="btn btn-outline-danger btn-sm" disabled={!editable} onClick={()=>{setDirty(true);setDimensionDrafts(rows=>rows.filter(v=>v.key!==d.key));}}><X size={13}/> Remove</button></div>
              <div className="ds-grid">
                <Field title="Dimension Name (English)" required><input className="form-control form-control-sm" disabled={!editable} value={d.nameEn} placeholder="e.g. By Gender" onChange={e=>updateDimension(d.key,{nameEn:e.target.value})}/></Field>
                <Field title="Dimension Name (Swahili)"><input className="form-control form-control-sm" disabled={!editable} value={d.nameSw} onChange={e=>updateDimension(d.key,{nameSw:e.target.value})}/></Field>
                <Field title="Required"><Select disabled={!editable} value={d.isRequired?'yes':'no'} onChange={v=>updateDimension(d.key,{isRequired:v==='yes'})} options={[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}/></Field>
                <Field title="Order"><input className="form-control form-control-sm" type="number" min="1" disabled={!editable} value={d.displayOrder} onChange={e=>updateDimension(d.key,{displayOrder:e.target.value})}/></Field>
                <div className="ds-span2"><Field title="Category Options" required hint="One option per row; e.g. Male, Female.">
                  {d.original && !d.optionsAvailable ?
                    <Banner tone="warning">The existing options of this dimension could not be loaded. Name, Required and Order can still be edited; the options stay as they are.</Banner>
                  : <>
                    {d.options.map((val,j)=><div className="ds-option-row" key={`${d.key}-${j}`}><input className="form-control form-control-sm" disabled={!editable} value={val} placeholder={`Option ${j+1}`} onChange={e=>updateDimension(d.key,{options:d.options.map((x,k)=>j===k?e.target.value:x)})}/>
                      <button type="button" className="btn btn-outline-danger btn-sm" disabled={!editable} onClick={()=>updateDimension(d.key,{options:d.options.filter((_,k)=>k!==j)})}><X size={13}/></button></div>)}
                    <button type="button" className="btn btn-outline-primary btn-sm" disabled={!editable} onClick={()=>updateDimension(d.key,{options:[...d.options,'']})}><Plus size={13}/> Add Option</button>
                  </>}
                </Field></div>
              </div>
            </div>)}
          </div>
        </div>
        <div className="ds-row-end mt-3 gap-2"><button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={reset}>Cancel</button><button type="submit" disabled={busy||!editable||!dataset?.id} className="btn btn-primary btn-sm">{busy?'Saving...':editId?'Update Indicator & Dimensions':'Save Indicator'}</button></div>
      </form>}
    </div>
  </div>;
});

function ReviewStep({dataset,indicators,dimensions,versions,notify,onUpdate,onClose,canManage=true,selectedOfficer,officers=[],user,units=[]}){
  const [busy,setBusy]=useState(false);
  async function activate(){if(!dataset?.id)return;setBusy(true);try{const result=await api.activate(dataset.id);await notify('success',result.message||'Dataset activated successfully.');await onUpdate(dataset.id);}
    catch(err){await showUserFacingError(err);}finally{setBusy(false);}}
  async function reopen(){setBusy(true);try{const res=await api.reopen(dataset.id);await notify('success',res.message||'Dataset reopened as draft.');await onUpdate(dataset.id);}catch(e){await showUserFacingError(e);}finally{setBusy(false);}}
  const officer=officers.find(o=>String(o.id)===String(selectedOfficer));
  const name=officer?.name||(String(user?.id)===String(selectedOfficer)?user?.name:null);
  const fields=[['Dataset Name',dataset?.datasetName],['Description',dataset?.description],['Institution',dataset?.institution?.name||user?.institution?.name||`Institution #${dataset?.institutionId||'—'}`], ...(dataset?.departmentId?[['Department',dataset?.department?.name||user?.department?.name||`Department #${dataset.departmentId}`]]:[])];
  return <div className="ds-step-body ds-review-clean">
    <div className="ds-review-stats">
      <div><small>Indicators</small><b>{indicators.length}</b></div>
      <div><small>Dimension categories</small><b>{dimensions.length}</b></div>
      <div><small>Frequencies</small><b>{(dataset?.frequencies||[]).map(label).join(', ')||'—'}</b></div>
      <div><small>Status</small><b>{label(dataset?.status)}</b></div>
    </div>
    <div className="ds-two-col ds-review-panels">
      <section className="ds-subcard"><h4>Basic Information</h4><dl className="ds-kv">{fields.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{pretty(value)}</dd></div>)}</dl></section>
      <section className="ds-subcard"><h4>Data Collection</h4><dl className="ds-kv">{[
        ['Data Source',dataset?.sourceDescription],['Dataset Method',dataset?.collectionMethod==='manual'?'Manual':label(dataset?.collectionMethod)],
        ...(dataset?.collectionMethod==='system'?[['Source System',dataset?.sourceSystemName]]:[]),
        ['Reporting Frequency',(dataset?.frequencies||[]).map(label).join(', ')],
        ['Consumers',(dataset?.consumers||[]).map(c=>c.name||c.consumer?.name).filter(Boolean).join(', ')],
        ['Responsible IDO/DDO (saved)',savedResponsibleUserID(dataset) &&
          savedResponsibleUserID(dataset)===idString(selectedOfficer)
            ? name||`User #${selectedOfficer}` : 'Not confirmed'],
        ['Indicators',indicators.length],['Dimensions',dimensions.length]
      ].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{pretty(value)}</dd></div>)}</dl></section>
    </div>
    {indicators.length>0&&(()=>{const hasDirection=indicators.some(row=>row.indicator?.performanceDirection);
      return <section className="ds-subcard mt-3"><h4>Indicators <span className="ds-count">{indicators.length}</span></h4>
      <div className="ds-table-scroll"><table className="table ds-table ds-review-indicators"><thead><tr><th>#</th><th>Indicator</th><th>Type</th><th>Unit</th><th>Aggregation</th>{hasDirection&&<th>Direction</th>}<th>Dimensions</th><th>Required</th></tr></thead><tbody>
        {indicators.map((row,i)=>{const dims=attachedDimensions(dimensions,row.indicatorId);const unit=units.find(u=>idString(u.id)===idString(row.indicator?.unitId));
          return <tr key={row.id||row.indicatorId}><td>{i+1}</td><td><strong>{row.indicator?.nameEn||'—'}</strong></td><td>{label(row.indicator?.dataType)}</td>
            <td>{unit?.label||(row.indicator?.unitId?`#${row.indicator.unitId}`:'—')}</td><td>{label(row.indicator?.aggregationRule||'none')}</td>
            {hasDirection&&<td>{normalDirection(row.indicator?.performanceDirection)==='lower_is_better'?'▼ Lower':row.indicator?.performanceDirection==='neutral'?'• Neutral':'▲ Higher'}</td>}
            <td>{dims.length?<div className="ds-dimension-tags">{dims.map(d=><span className="ds-status ds-violet" key={d.dimensionId}>{d.dimension?.nameEn||'Dimension'}</span>)}</div>:'—'}</td>
            <td><span className={`ds-status ${row.isRequired?'ds-yellow':'ds-grey'}`}>{row.isRequired?'Yes':'No'}</span></td></tr>;})}
      </tbody></table></div></section>;})()}
    <section className="ds-subcard mt-3"><h4>Version History ({versions.length})</h4>
      {versions.length?<div className="ds-table-scroll"><table className="table ds-table"><thead><tr><th>Version</th><th>Effective From</th><th>Created By</th></tr></thead><tbody>{versions.map(v=><tr key={v.id}><td>{pretty(v.version_number??v.versionNumber)}</td><td>{pretty(v.effective_from??v.effectiveFrom)}</td><td>{pretty(v.created_by??v.createdBy)}</td></tr>)}</tbody></table></div>:<p className="ds-muted">There are no previous versions of this dataset.</p>}
    </section>
    <div className="ds-row-end mt-3">
      {!canManage?null:dataset?.status==='active'||dataset?.status==='inactive'?<button onClick={reopen} disabled={busy} className="btn btn-outline-primary"><RotateCcw size={16}/> Reopen as Draft</button>:<button onClick={activate} disabled={busy||!dataset?.id||!indicators.length} className="btn btn-primary"><CheckCircle2 size={16}/> Activate Dataset</button>}
      <button onClick={onClose} className="btn btn-outline-secondary">Close</button>
    </div>
  </div>;
}

export default function Datasets(){
  const {user}=useOutletContext();
  // UI restrictions mirror /me scope; Laravel remains the authorization authority.
  const canManageDataset=useCallback(d=>{
    const myInstitution=userInstitutionId(user);
    const sameInstitution=myInstitution!=null && d?.institutionId!=null && Number(myInstitution)===Number(d.institutionId);
    const roles=roleCodes(user);
    return Boolean(sameInstitution && (!roles.includes('DDO') || Number(userDepartmentId(user))===Number(d?.departmentId)));
  },[user]);
  const [items,setItems]=useState([]);const [page,setPage]=useState(1);const [total,setTotal]=useState(0);
  const [filter,setFilter]=useState('');const [search,setSearch]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useErrorDialogState('');
  const [dialog,setDialog]=useState(false);const [step,setStep]=useState(0);const [dataset,setDataset]=useState(null);
  const [calendarModal,setCalendarModal]=useState(null);
  const [calendarRows,setCalendarRows]=useState([]);
  const [calendarLoading,setCalendarLoading]=useState(false);
  const [calendarError,setCalendarError]=useErrorDialogState('');
  const [form,setForm]=useState(emptyForm());const [savedBasicSnapshot,setSavedBasicSnapshot]=useState(null);const [formErrors,setFormErrors]=useState({});const [saving,setSaving]=useState(false);
  const [stepMessage,setStepMessage]=useState('');
  const saveGate=useRef(false);
  const datasetLoadEpoch=useRef(0);
  const indicatorsRef=useRef(null);
  const [relatedLoading,setRelatedLoading]=useState(false);
  const [selectedOfficer,setSelectedOfficer]=useState('');
  const [scopedAssignees,setScopedAssignees]=useState([]);
  const [confirmedOfficer,setConfirmedOfficer]=useState(null);
  const [departments,setDepartments]=useState([]);
  const [departmentError,setDepartmentError]=useErrorDialogState('');
  const [sectors,setSectors]=useState([]);const [units,setUnits]=useState([]);
  const [sectorError,setSectorError]=useErrorDialogState('');
  const [officers,setOfficers]=useState([]);const [officerError,setOfficerError]=useErrorDialogState('');
  const [calendar,setCalendar]=useState([]);const [indicators,setIndicators]=useState([]);const [dimensions,setDimensions]=useState([]);
  const [progress,setProgress]=useState(null);const [versions,setVersions]=useState([]);
  // Source of truth is a Laravel-confirmed save, never clicking Next. Editing an
  // already saved Basic form temporarily clears its green tick until Save succeeds.
  const basicSaved=Boolean(dataset?.id && savedBasicSnapshot === JSON.stringify(form) &&
    Boolean(confirmedOfficer) && idString(confirmedOfficer)===idString(selectedOfficer));
  const completedSteps=useMemo(()=>datasetWizardCompletion({dataset,indicators,basicSaved}),
    [dataset,indicators,basicSaved]);
  const canEditCurrentDataset=dataset?.id && canManageDataset(dataset) && isDatasetDraft(dataset);
  const existingDatasetLocked=Boolean(dataset?.id && !canEditCurrentDataset);
  const [PAGE_SIZE,setPageSize]=usePageSize('datasets',20);
  // Calendar icon is the fifth approved Dataset row action. Read assigned
  // period deadlines from Laravel; editing belongs to the MOA period module.
  async function viewCalendar(record){
    setCalendarModal(record);setCalendarRows([]);setCalendarError('');setCalendarLoading(true);
    try {
      const result=await allDatasetOptions(p=>api.periodsOfDataset(record.id,{page:p}));
      setCalendarRows(result);
    }catch(error){setCalendarError(errText(error));}finally{setCalendarLoading(false);}
  }
  const notify=useCallback(async(kind,message)=>{await Swal.fire({icon:kind,title:kind==='success'?'Success':kind==='warning'?'Attention':'Request failed',text:message});},[]);
  // Status counts for the KPI cards and tabs, counted from the scoped list Laravel returns (never guessed).
  const [counts,setCounts]=useState(null);
  const loadCounts=useCallback(async()=>{
    try{
      const rows=await allDatasetOptions(p=>api.list({page:p,perPage:100}));
      const by=status=>rows.filter(d=>String(d.status||'').toLowerCase()===status).length;
      setCounts({all:rows.length,active:by('active'),draft:by('draft'),inactive:by('inactive')});
    }catch{setCounts({all:null,active:null,draft:null,inactive:null});}
  },[]);
  const loadList=useCallback(async()=>{void loadCounts();setLoading(true);setError('');try{const data=await fetchUiPage((serverPage,perPage)=>api.list({page:serverPage,perPage,...(filter?{status:filter}:{})}),page,PAGE_SIZE);setItems(data.items);setTotal(data.total);}
    catch(err){setError(errText(err));setItems([]);setTotal(0);}finally{setLoading(false);}},[page,PAGE_SIZE,filter,loadCounts]);
  useEffect(()=>{loadList();},[loadList]);
  useEffect(()=>{let valid=true;getActiveReferenceOptions('SECTOR').then(x=>{if(valid)setSectors(x);}).catch(()=>{});return()=>{valid=false;};},[]);
  const visible=useMemo(()=>items.filter(d=>{
    const s=escapeSearch(search);return !s||[d.datasetName,d.datasetCode,d.sourceDescription].some(v=>escapeSearch(v).includes(s));
  }),[items,search]);
  const loadOptions=useCallback(async()=>{
    setSectorError('');setOfficerError('');setDepartmentError('');
    const ownership=getDatasetOwnership(user);
    const attempts=await Promise.allSettled([
      ownership.canChooseDepartment?allDatasetOptions(p=>listDepartments({page:p,perPage:100,per_page:100})):Promise.resolve([]),
      getActiveReferenceOptions('SECTOR'),getActiveReferenceOptions('UNIT'),
    ]);
    if(attempts[0].status==='fulfilled')setDepartments(attempts[0].value);
    else{setDepartments([]);setDepartmentError(`Ministry departments unavailable: ${errText(attempts[0].reason)}`);}
    if(attempts[1].status==='fulfilled')setSectors(attempts[1].value);else setSectorError(errText(attempts[1].reason));
    if(attempts[2].status==='fulfilled')setUnits(attempts[2].value);else setUnits([]);
    // /users is privileged. The logged-in IDO/DDO can still select themselves
    // without this endpoint. Never fall back to fabricated officer records.
    const inst=userInstitutionId(user);
    if(!inst){setOfficers([]);setOfficerError('Missing institution ID in /me');return;}
    try{
      // Laravel-scoped list of active eligible IDO (institution) / DDO (department).
      const params={institutionId:Number(inst)};
      if(ownership.kind==='ministry'&&ownership.departmentId)params.departmentId=Number(ownership.departmentId);
      setOfficers(await api.eligibleOfficers(params));
      setOfficerError('');
    }catch(err){
      // Fallback for administrators only. IDO/DDO/IHOD etc. have no GET /users
      // permission: a 403 here is expected and must NOT pop up an error dialog.
      const canListUsers=(user?.permissions||[]).some(p=>p==='users.manage.ministry'||p==='users.manage.institution');
      if(canListUsers){
        try{
          const roles=ownership.kind==='ministry'?['DDO']:['IDO'];
          const fetched=await Promise.all(roles.map(role=>allDatasetOptions(p=>listUsers({institution_id:inst,role,page:p,perPage:100,per_page:100}))));
          setOfficers([...new Map(fetched.flat().map(x=>[x.id,x])).values()]);setOfficerError('');return;
        }catch{ /* fall through */ }
      }
      setOfficers([]);
      if(![401,403].includes(err?.response?.status))setOfficerError(errText(err));
    }
  },[user]);
  /** Load actual eligible users after an ID exists. A GET never assigns anyone. */
  const loadScopedAssignees=useCallback(async id=>{
    try{
      const options=await api.getAssignees(id);
      setScopedAssignees(options);
      setOfficerError('');
      return options;
    }catch(error){
      setScopedAssignees([]);
      if(![401,403].includes(error?.response?.status))setOfficerError(`Cannot load dataset assignees: ${errText(error)}`);
      return [];
    }
  },[]);
  /** Refresh wizard ticks after a Laravel write; no fake completion on click. */
  const refreshConfiguration=useCallback(async id=>{
    try{const info=await api.progress(id);setProgress(info);}
    catch{setProgress(null);}
  },[]);
  const loadDataset=useCallback(async(id)=>{
    const epoch=++datasetLoadEpoch.current;
    const d=await api.get(id);
    if(epoch!==datasetLoadEpoch.current)return d;
    setDataset(d);
    const assigned=savedResponsibleUserID(d);
    setConfirmedOfficer(assigned);
    setSelectedOfficer(assigned||'');
    void loadScopedAssignees(id);
    const loadedForm={datasetName:d.datasetName||'',description:d.description||'',
      requiresMinistryDepartment:getDatasetOwnership(user).kind==='ministry',
      institutionId:idString(d.institutionId),departmentId:idString(d.departmentId),sourceDescription:d.sourceDescription||'',
      collectionMethod:d.collectionMethod==='system'?'system':'manual',sourceSystemName:d.sourceSystemName||'',
      frequencies:d.frequencies||[],sectors:(d.sectorIds||[]).map(s=>({sectorId:Number(s),subsectorIds:(d.subsectorIds||[]).map(Number)})).slice(0,1),
      consumers:(d.consumers||[]).map(c=>({id:c.id??c.consumerId,name:c.name??c.consumer?.name??''})).filter(c=>c.name),
    };
    setForm(loadedForm);setSavedBasicSnapshot(JSON.stringify(loadedForm));
    // Core GET unlocks the editor. Five related GETs should not freeze the
    // wizard or stop step headings from responding if a peripheral API is slow.
    setRelatedLoading(true);
    void Promise.allSettled([
      allDatasetOptions(p=>api.indicators(id,{page:p,perPage:100})),
      allDatasetOptions(p=>api.dimensions(id,{page:p,perPage:100})),
      allDatasetOptions(p=>api.periodsOfDataset(id,{page:p})),
      api.progress(id),allDatasetOptions(p=>api.versions(id,{page:p,perPage:100})),
    ]).then(tasks=>{
      if(epoch!==datasetLoadEpoch.current)return;
      if(tasks[0].status==='fulfilled')setIndicators(tasks[0].value);else setIndicators([]);
      if(tasks[1].status==='fulfilled')setDimensions(tasks[1].value);else setDimensions([]);
      if(tasks[2].status==='fulfilled')setCalendar(tasks[2].value);else setCalendar([]);
      if(tasks[3].status==='fulfilled')setProgress(tasks[3].value);else setProgress(null);
      if(tasks[4].status==='fulfilled')setVersions(tasks[4].value);else setVersions([]);
    }).finally(()=>{if(epoch===datasetLoadEpoch.current)setRelatedLoading(false);});
    return d;
  },[user,loadScopedAssignees]);
  async function openNew(){datasetLoadEpoch.current+=1;setRelatedLoading(false);setStepMessage('');
    const ownership=getDatasetOwnership(user);
    setForm({...emptyForm(),institutionId:idString(ownership.institutionId),
      departmentId:idString(ownership.departmentId),requiresMinistryDepartment:ownership.kind==='ministry'});setSavedBasicSnapshot(null);setDataset(null);setFormErrors({});setStep(0);setIndicators([]);setDimensions([]);setCalendar([]);setSelectedOfficer('');setConfirmedOfficer(null);setScopedAssignees([]);setVersions([]);setProgress(null);setDialog(true);await loadOptions();}
  async function openExisting(record,startStep=0){
    if(!canManageDataset(record)&&startStep!==2)startStep=2;
    setStepMessage('');setSavedBasicSnapshot(null);setDataset(null);setProgress(null);setCalendar([]);setIndicators([]);
    setDialog(true);setSaving(true);setStep(startStep);setFormErrors({});setSelectedOfficer('');setConfirmedOfficer(null);setScopedAssignees([]);
    void loadOptions();
    try{await loadDataset(record.id);}catch(e){await showUserFacingError(e);setDialog(false);}finally{setSaving(false);}
  }
  /**
   * CRITICAL NEXT FLOW: A successful POST/PATCH commits details once. Advance as soon as
   * Laravel responds; expensive indicators/calendars/users loading happens afterward.
   * We retain the returned ID before fetching to avoid duplicate creation on GET failure.
   */
  async function saveBasic(){
    if (saveGate.current) return false;
    if(dataset && !isDatasetDraft(dataset)){
      setStepMessage('Reopen this dataset as Draft before editing configuration.');
      return false;
    }
    // A previously saved dataset does not need an unnecessary PATCH simply to
    // revisit its indicators. Officer assignment is still verified when changed.
    if(dataset?.id && savedBasicSnapshot===JSON.stringify(form) &&
       idString(selectedOfficer)===idString(confirmedOfficer)){
      setStep(1);
      setStepMessage(confirmedOfficer?'':'Responsible IDO/DDO is not assigned yet. You can review indicators, but choose an officer and save Basic Information before activation.');
      return true;
    }
    const errors=validateDatasetBasic(form);
    // Candidate lookup by GET /datasets/{id}/assignees is impossible before the
    // draft has an ID. Allow one initial metadata save, then require assignment.
    if(dataset?.id && !selectedOfficer) errors.responsibleUserId='Select a responsible IDO/DDO before proceeding.';
    if(selectedOfficer){
      try{responsibleUserWriteFields(selectedOfficer);}catch(error){errors.responsibleUserId=error.message;}
    }
    setFormErrors(errors);
    if(Object.keys(errors).length){
      setStepMessage('Complete the highlighted required fields before continuing.');
      return false;
    }
    setStepMessage('');saveGate.current=true;setSaving(true);
    try{
      const assignment=responsibleUserWriteFields(selectedOfficer);
      const payload=dataset
        ? datasetUpdatePayload(form,assignment)
        : {...form,responsibleUserFields:assignment};
      // SECTOR EDIT ON DRAFT: compare with the last Laravel-loaded form.
      let previousSectors=[];
      try{previousSectors=JSON.parse(savedBasicSnapshot||'{}').sectors||[];}catch{previousSectors=[];}
      const sectorsChanged=Boolean(dataset?.id)&&JSON.stringify(sectorWritePayload(previousSectors))!==JSON.stringify(sectorWritePayload(form.sectors));
      const result=dataset?await api.update(dataset.id,payload):await api.create(payload);
      const id=dataset?.id ?? result.data?.id;
      // Separate PATCH so a backend that still rejects `sectors` cannot block
      // the other details that were just saved. Read-back below confirms it.
      let sectorWriteError='';
      if(sectorsChanged){
        try{await api.update(id,{sectors:sectorWritePayload(form.sectors)});}
        catch(error){sectorWriteError=errText(error);}
      }
      if(!id)throw new Error('The system saved the dataset but did not return its ID. Reload before retrying.');
      const savedRecord={...dataset,...result.data,id,
        status:result.data?.status??dataset?.status??'draft',
        institutionId:result.data?.institutionId ?? Number(form.institutionId),
        departmentId:result.data?.departmentId ?? (form.departmentId?Number(form.departmentId):null),
        frequencies:result.data?.frequencies??form.frequencies};
      setDataset(savedRecord);
      setFormErrors({});setSavedBasicSnapshot(JSON.stringify(form));
      // Read-back is authoritative. A successful HTTP POST/PATCH cannot be used
      // to claim an assignment when Laravel still stores responsibleUserId:null.
      let serverRecord;
      try{serverRecord=await api.get(id);}catch(error){
        setConfirmedOfficer(null);
        void showUserFacingError(error,'Unable to verify responsible officer');
        void loadScopedAssignees(id);void loadList();return false;
      }
      const persisted=savedResponsibleUserID(serverRecord);
      setDataset(old=>({...old,...serverRecord}));
      if(sectorsChanged&&!sectorsMatch(serverRecord,form.sectors)){
        await Swal.fire({icon:'warning',title:'Sector not updated',
          text:`Other details were saved, but the new Sector/Subsector was not saved${sectorWriteError?` (${sectorWriteError})`:''}. Please try again.`});
        const restored={...form,sectors:(serverRecord.sectorIds||[]).map(s=>({sectorId:Number(s),subsectorIds:(serverRecord.subsectorIds||[]).map(Number)})).slice(0,1)};
        setForm(restored);setSavedBasicSnapshot(JSON.stringify(restored));
      }
      setConfirmedOfficer(persisted);
      void loadScopedAssignees(id);
      void loadList();
      if(!selectedOfficer){
        void Swal.fire({icon:'info',title:'Draft saved',text:'Choose a responsible officer, then select Save & Next.'});
        return false;
      }
      if(idString(persisted)!==idString(selectedOfficer)){
        setFormErrors({});
        void showUserFacingError('The saved responsible officer does not match the selected officer. Refresh and try again.', 'Responsible officer not confirmed');
        return false;
      }
      // Only proceed to Indicators when the backend GET confirms ownership.
      setStep(1);setStepMessage('');
      Swal.fire({toast:true,position:'top-end',timer:2500,showConfirmButton:false,
        icon:'success',title:result.message||(dataset?'Dataset and responsible officer updated.':'Dataset and responsible officer saved.')});
      void loadDataset(id).catch(error=>{void showUserFacingError(error,'Unable to refresh dataset');});
      return true;
    }catch(error){
      setFormErrors({});void showUserFacingError(error,'Could not save dataset');return false;
    }finally{saveGate.current=false;setSaving(false);}
  }
  // Navigation is NOT validation. Once a dataset exists, allow the user to revisit
  // any step by clicking its heading, even if the current step has incomplete data,
  // an unverified officer assignment or the dataset is active/read-only.
  // Saving remains explicit: only Save & Next / Save Indicator call Laravel writes.
  function goToWizardStep(target){
    if(!canNavigateDatasetStep(dataset,target,saving||saveGate.current))return;
    setStepMessage('');
    setStep(target);
  }
  async function reopenCurrentForEditing(){
    if(!dataset?.id || !canManageDataset(dataset))return;
    const confirmation=await Swal.fire({icon:'question',title:'Reopen as Draft?',
      text:'An active dataset must be reopened as Draft before its configuration can be edited. Existing submission history is preserved.',
      showCancelButton:true,confirmButtonText:'Reopen as Draft'});
    if(!confirmation.isConfirmed)return;
    setSaving(true);setStepMessage('');
    try{
      await api.reopen(dataset.id);
      const loaded=await loadDataset(dataset.id);
      if(!isDatasetDraft(loaded)){
        void showUserFacingError('The dataset is not available for editing yet. Please refresh and try again.', 'Unable to edit dataset');
        return;
      }
      void loadList();
      void Swal.fire({icon:'success',title:'Dataset reopened',text:'You can now edit its information and indicators.'});
    }catch(error){void showUserFacingError(error,'Unable to reopen dataset');}
    finally{setSaving(false);}
  }
  async function next(){
    if(saving||saveGate.current)return;
    if(step===0){await saveBasic();return;}
    if(step===1){
      if(!dataset?.id){setStepMessage('Save basic dataset information first.');return;}
      if(relatedLoading||!indicatorsRef.current){setStepMessage('Indicators are still loading. You can use the step headings while they load.');return;}
      setSaving(true);
      try{
        const saved=await indicatorsRef.current.saveAndNext();
        if(!saved){setStepMessage('Save at least one indicator and any pending changes before continuing.');return;}
        setStepMessage('');setStep(2);void refreshConfiguration(dataset.id);
      }finally{setSaving(false);}
    }
  }
  // Only the documented POST /draft route is used; whether an INACTIVE dataset
  // can be restored is not explicit in the contract. Display backend errors honestly.
  async function restoreDraft(d){
    const confirmation=await Swal.fire({icon:'question',title:'Restore as Draft?',text:'Restore the dataset for editing while keeping its version history.',showCancelButton:true,confirmButtonText:'Restore as Draft'});
    if(!confirmation.isConfirmed)return;
    try{const res=await api.reopen(d.id);await notify('success',res.message||'Dataset restored as Draft.');await loadList();}
    catch(error){await showUserFacingError(error);}
  }
  async function deactivate(d){const confirmation=await Swal.fire({icon:'warning',title:'Deactivate dataset?',text:'Previous dataset versions and submissions will be preserved.',showCancelButton:true,confirmButtonText:'Deactivate'});
    if(!confirmation.isConfirmed)return;try{const res=await api.deactivate(d.id);await notify('success',res.message||'Dataset deactivated.');await loadList();}catch(e){await showUserFacingError(e);}}
  const steps=['Basic Information','Indicators & Dimensions','Review & Submit'];
  const org=ownOrg(user);
  const count=key=>counts?.[key]??null;
  const shownCount=key=>count(key)===null?'…':`${count(key)} dataset${count(key)===1?'':'s'}`;
  const frequencyRows=FREQUENCIES.map(f=>({name:label(f),value:items.filter(d=>(d.frequencies||[]).includes(f)).length})).filter(r=>r.value>0);
  const pickStatus=value=>{setFilter(value==='all'?'':value);setPage(1);};
  return <div className="vim-institutions ds-page mu-page">
    <MuHeader logo={org.logo} initials={org.initials||'DS'} title="Datasets"
      subtitle={`${org.name?`${org.name} · `:''}indicators and reporting structures for data entry`}>
      <button className="mu-btn mu-btn-primary vim-add" onClick={openNew}><Plus size={17}/> Add Dataset</button>
    </MuHeader>
    <div className="mu-kpis">
      <MuKpi tone="blue" icon={<Database size={18}/>} title="All datasets" value={shownCount('all')} note="in your scope" arrow={false} onOpen={()=>pickStatus('all')}/>
      <MuKpi tone="green" icon={<CheckCircle2 size={19}/>} title="Active" value={shownCount('active')} note="open for data entry" arrow={false} onOpen={()=>pickStatus('active')}/>
      <MuKpi tone="amber" icon={<Pencil size={17}/>} title="Draft" value={shownCount('draft')} note="finish setup" arrow={false} onOpen={()=>pickStatus('draft')}/>
      <MuKpi tone="red" icon={<RotateCcw size={18}/>} title="Inactive" value={shownCount('inactive')} note="not collecting" arrow={false} onOpen={()=>pickStatus('inactive')}/>
    </div>
    <MuCard title="Dataset records" count={loading?'…':total} className="vim-list-card ds-list-card"><div className="ds-toolbar mu-toolbar">
      <MuTabs label="Filter by status" value={filter||'all'} onChange={pickStatus} items={[
        {key:'all',label:'All',count:count('all')},{key:'active',label:'Active',count:count('active')},
        {key:'draft',label:'Draft',count:count('draft')},{key:'inactive',label:'Inactive',count:count('inactive')}]}/>
      <label className="mu-search ds-search"><Search size={16}/><input aria-label="Search datasets in current page" placeholder="Search name, code or source (this page)…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <button onClick={loadList} title="Refresh" aria-label="Refresh" className="mu-btn ds-refresh"><RotateCcw size={15}/></button>
    </div>
    <div className="vim-table-scroll"><table className="table vim-table ds-table mu-table"><thead><tr><th>#</th><th>Dataset</th><th>Sector</th><th>Source</th><th>Frequency</th><th>Priority</th><th>Method</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
      {visible.map((d,i)=><tr key={d.id}><td>{(page-1)*PAGE_SIZE+i+1}</td><td><strong>{d.datasetName}</strong><small className="ds-code">{pretty(d.datasetCode)}</small></td><td>{(d.sectorIds||[]).map(id=>sectors.find(s=>Number(s.id)===Number(id))?.label||`#${id}`).join(', ')||'—'}</td><td>{d.sourceDescription||`Institution #${d.institutionId}`}</td><td>{(d.frequencies||[]).length?<span className="ds-freq-list">{d.frequencies.map(f=><span key={f} className="ds-freq">{label(f)}</span>)}</span>:'—'}</td><td><span className={`ds-status ds-priority ds-priority-${d.priority||'none'}`}>{d.priority?label(d.priority):'Pending MDO'}</span></td><td><span className="ds-status ds-blue">{d.collectionMethod==='manual'?'Manual':d.collectionMethod==='system'?'System':pretty(d.collectionMethod)}</span></td><td><span className={`ds-status ${d.status==='active'?'ds-green':d.status==='draft'?'ds-yellow':'ds-grey'}`}>{label(d.status)}</span></td><td className="mu-actions"><RowActionsMenu label={`Dataset actions for ${d.datasetName}`}>
        <button type="button" onClick={()=>openExisting(d,2)} title="View Details" aria-label="View Details"><Eye size={16}/></button>
        <button type="button" onClick={()=>openExisting(d,0)} disabled={!canManageDataset(d)} title="Edit Dataset" aria-label="Edit Dataset"><Pencil size={16}/></button>
        <button type="button" onClick={()=>viewCalendar(d)} title="View Reporting Calendar" aria-label="View Reporting Calendar"><CalendarClock size={16}/></button>
        <button type="button" onClick={()=>openExisting(d,1)} disabled={!canManageDataset(d)} title="Indicators & Dimensions" aria-label="Indicators & Dimensions"><Database size={16}/></button>
        <button type="button" className="ds-red-button" title={d.status==='inactive'?'Restore as Draft':'Deactivate Dataset'} aria-label={d.status==='inactive'?'Restore as Draft':'Deactivate Dataset'} disabled={!canManageDataset(d)} onClick={()=>d.status==='inactive'?restoreDraft(d):deactivate(d)}>{d.status==='inactive'?<RotateCcw size={16}/>:<Trash2 size={16}/>}</button>
      </RowActionsMenu></td></tr>)}
      {!loading&&!visible.length&&<tr><td colSpan={9} className="vim-empty">No datasets match the selected filters.</td></tr>}
    </tbody></table><TableLoader active={loading} /></div>
    <div className="vim-pagination-bar mu-table-foot"><span>Showing {visible.length} of {total} {search&&'(search applies to this page only)'}</span><div className="vim-pagination-controls">
      <PageSizeSelect value={PAGE_SIZE} onChange={v=>{setPageSize(v);setPage(1);}}/>
      <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))} aria-label="Previous page"><ChevronLeft size={16}/></button><button className="active">{page}</button><button disabled={page*PAGE_SIZE>=total} onClick={()=>setPage(p=>p+1)} aria-label="Next page"><ChevronRight size={16}/></button>
    </div></div></MuCard>
    <div className="ds-charts">
      <MuCard title="Datasets by status" tag="Pie"><MuDonutLegend centerLabel="datasets" loading={!counts} center={count('all')??0} data={[
        {name:'Active',value:count('active')??0,color:'#1eb53a'},{name:'Draft',value:count('draft')??0,color:'#e0b400'},{name:'Inactive',value:count('inactive')??0,color:'#d92d20'}]} onOpen={()=>pickStatus('all')}/></MuCard>
      <MuCard title={total>items.length?'Datasets by frequency (this page)':'Datasets by frequency'} tag="Bar">
        {frequencyRows.length?<div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={frequencyRows} margin={{top:8,right:8,left:-20,bottom:0}}>
          <CartesianGrid vertical={false} stroke="#f1f4f9"/><XAxis dataKey="name" tick={{fontSize:11.5}}/><YAxis allowDecimals={false} tick={{fontSize:11.5}}/>
          <Tooltip cursor={{fill:'#f4f7fb'}} formatter={value=>[value,'Datasets']}/><Bar dataKey="value" fill="#0b5bd3" radius={[6,6,0,0]} maxBarSize={36}/></BarChart></ResponsiveContainer></div>
        :<p className="mu-empty">No datasets to chart.</p>}
      </MuCard>
    </div>
    {calendarModal&&<Dialog title={`Reporting Calendar — ${calendarModal.datasetName}`} close={()=>setCalendarModal(null)}>
      <div className="ds-modal-content">
        <p className="text-muted">View reporting assignments and deadlines for this dataset.</p>
        
        {calendarLoading?<p role="status">Loading dataset calendar...</p>:<div className="ds-table-scroll"><table className="ds-table"><thead><tr><th>Reporting Period</th><th>Frequency</th><th>Due Date</th><th>Responsible IDO/DDO</th><th>Reminder</th></tr></thead><tbody>
          {calendarRows.map(row=><tr key={row.id}><td>{row.periodLabel||`#${row.reportingPeriodId}`}</td><td>{row.periodType||'—'}</td><td>{row.deadline||'—'}</td><td>{row.responsibleUserId||'—'}</td><td>{row.remindersEnabled?'Enabled':'Disabled'}</td></tr>)}
          {!calendarRows.length&&<tr><td colSpan={5}>No persisted reporting calendar assignments found.</td></tr>}
        </tbody></table></div>}
        <div className="ds-row-end mt-3"><button type="button" className="btn btn-outline-secondary" onClick={()=>setCalendarModal(null)}>Close</button></div>
      </div>
    </Dialog>}
    {dialog&&<Dialog title={dataset?`Manage Dataset — ${dataset.datasetName}`:'Add Dataset'}
      subtitle={[`Step ${step+1} of ${steps.length}`,dataset?.status?label(dataset.status):'',dataset?.datasetCode||(!dataset?'save Basic Information to unlock the next steps':'')].filter(Boolean).join(' · ')} close={()=>{setDialog(false);loadList();}}>
      {/* Submission-style completed ticks: a step is never completed just by visiting it. */}
      <nav className="ds-steps" aria-label="Dataset setup steps">{steps.map((s,i)=>{
        const complete=completedSteps[i];
        return <button type="button" key={s}
          onClick={()=>goToWizardStep(i)}
          className={`${step===i?'ds-step-active':''} ${complete?'ds-step-complete':''}`.trim()}
          disabled={saving||(!dataset&&i>0)}
          aria-current={step===i?'step':undefined}
          aria-label={`${s} — ${complete?'Saved':step===i?'Current step':'Not saved'}`}>
          <span className="ds-step-number" aria-hidden="true">
            {complete?<Check size={15} strokeWidth={3}/>:i+1}
          </span>
          <span className="ds-step-title">{s}</span>
          {complete&&<span className="visually-hidden">Saved</span>}
        </button>;
      })}</nav>
      <div className="ds-modal-content">{saving&&<Banner>Saving changes...</Banner>}
        
        {existingDatasetLocked&&<div className="ds-edit-lock-notice" role="status">
          <div><strong>{isDatasetDraft(dataset)?'View only':'Dataset configuration is read-only'}</strong>
            <span>{isDatasetDraft(dataset)?'Your account does not have editing access for this dataset.':
              `This dataset is ${label(dataset.status)}. Reopen it as Draft to edit its information and indicators.`}</span></div>
          {canManageDataset(dataset)&&!isDatasetDraft(dataset)&&
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={saving} onClick={reopenCurrentForEditing}><RotateCcw size={15}/> Reopen as Draft</button>}
        </div>}
        {step===0&&<BasicStep form={form} setForm={setForm} sectors={sectors} sectorError={sectorError}
          departments={departments} departmentError={departmentError}
          user={user} officers={officers} scopedAssignees={scopedAssignees} officerError={officerError}
          selectedOfficer={selectedOfficer} setSelectedOfficer={setSelectedOfficer}
          locked={Boolean(dataset?.id)} readOnly={existingDatasetLocked} errors={formErrors}/>}
        {dataset?.id&&!relatedLoading&&<div hidden={step!==1}><IndicatorsStep ref={indicatorsRef} dataset={dataset} indicators={indicators} setIndicators={setIndicators} dimensions={dimensions} setDimensions={setDimensions} units={units} notify={notify} editable={canEditCurrentDataset} onConfigurationChange={refreshConfiguration}/></div>}
        {relatedLoading&&step===1&&<div className="ds-step-body" role="status">Loading saved indicators and dimensions...</div>}
        {step===2&&(relatedLoading?<div className="ds-step-body" role="status">Loading saved dataset configuration for review...</div>:
          <DatasetReviewErrorBoundary key={dataset?.id??'new'} onBack={()=>goToWizardStep(1)}>
            <ReviewStep dataset={dataset} canManage={canManageDataset(dataset)} indicators={indicators} dimensions={dimensions} versions={versions} notify={notify} selectedOfficer={selectedOfficer} officers={officers} user={user} units={units} onUpdate={loadDataset} onClose={()=>{setDialog(false);loadList();}}/>
          </DatasetReviewErrorBoundary>)}
      </div><footer className="ds-modal-footer"><small>{dataset?.id?'Click a step above to navigate; Save & Next saves your changes.':'Save Basic Information to unlock the remaining steps.'}</small><div className="d-flex gap-2">
        <button className="btn btn-outline-secondary" onClick={()=>{setDialog(false);loadList();}}>Cancel</button>
        {step>0&&<button className="btn btn-outline-secondary" onClick={()=>goToWizardStep(step-1)}><ChevronLeft size={15}/> Back</button>}
        {step<2&&<button className="btn btn-primary" disabled={saving||!canManageDataset(dataset??{institutionId:userInstitutionId(user),departmentId:userDepartmentId(user)})||(step===0&&dataset!=null&&!canEditCurrentDataset)} onClick={next}>{saving?'Saving...':'Save & Next'} <ChevronRight size={15}/></button>}
      </div></footer></Dialog>}
  </div>;
}
