import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * FILE PATH: src/pages/Admin/PortalSettings.jsx
 * ROUTE: /dashboard/administration/portal-settings
 * NAVIGATION: App.jsx -> ProtectedRoute -> DashboardLayout -> RouteAccess -> PortalSettings.
 * REFERENCE: APPROVED Portal Settings screenshot: left categories, right changing form.
 * API FLOW: PortalSettings.jsx -> API/portalSettings.jsx -> API/axios.jsx -> Laravel.
 * BACKEND: GET/PUT /portal-settings verified (portal_settings.manage).
 * The approved mockup includes some UI-only fields NOT in Laravel contract.
 * Only portal_name, portal_tagline, contact_email, contact_phone, announcement
 * and portal_logo can be persisted. Other visual fields remain readonly.
 * System Preferences (local admin theme/loaders) uses no Laravel endpoint.
 * Only Portal Information right-pane form has approved design;
 * do not invent fields for the other settings panes before UI and API agreement.
 */
import {useEffect, useMemo, useRef, useState} from 'react';
import Swal from "../../utils/portalAlerts";
import {
  Bell, Building2, CalendarDays, ChevronRight, CircleCheck, Clock3,
  CloudUpload, Contact, FileCog, FileText, Globe2, Hash, Info, Landmark,
  LockKeyhole, Mail, Palette, Phone, RotateCcw, Save, Search, Settings,
  Shield, ShieldCheck, SlidersHorizontal, Trash2, Upload, Wrench,
} from 'lucide-react';
import {getPortalSettings,savePortalSettings,uploadPortalLogo} from '../../API/portalSettings';
import {apiError} from '../../API/resourceHelpers';
import './institutions.css';
import './portalSettings.css';
import PortalSystemPreferences from './PortalSystemPreferences';
import '../../styles/admin-modern.css';
import {MuBadge, MuHeader} from '../../components/modern/ModernUI.jsx';

// Exactly the categories and entries on the approved two-panel reference.
const SETTINGS_GROUPS = [
  {label:'GENERAL',items:[
    {id:'portal-information',label:'Portal Information',Icon:Landmark},
    {id:'contact-information',label:'Contact Information',Icon:Phone},
    {id:'system-language',label:'System Language',Icon:Globe2},
    {id:'date-time',label:'Date & Time',Icon:CalendarDays},
  ]},
  {label:'EMAIL SETTINGS',items:[
    {id:'smtp-configuration',label:'SMTP Configuration',Icon:Mail},
    {id:'email-templates',label:'Email Templates',Icon:FileText},
    {id:'notification-settings',label:'Notification Settings',Icon:Bell},
  ]},
  {label:'SECURITY SETTINGS',items:[
    {id:'password-policy',label:'Password Policy',Icon:LockKeyhole},
    {id:'session-management',label:'Session Management',Icon:Shield},
    {id:'two-factor-authentication',label:'Two-Factor Authentication',Icon:ShieldCheck},
  ]},
  {label:'SYSTEM SETTINGS',items:[
    {id:'file-upload-settings',label:'File Upload Settings',Icon:CloudUpload},
    {id:'allowed-file-types',label:'Allowed File Types',Icon:FileCog},
    {id:'system-preferences',label:'System Preferences',Icon:Palette},
    {id:'maintenance-mode',label:'Maintenance Mode',Icon:Wrench},
  ]},
  {label:'DOCUMENT SETTINGS',items:[
    {id:'document-numbering',label:'Document Numbering',Icon:Hash},
    {id:'document-templates',label:'Document Templates',Icon:FileText},
  ]},
];

// These are textual design values from the approved UI screenshot, NOT backend records.
const referenceForm = Object.freeze({
  portal_name:'',portal_tagline:'',contact_email:'',contact_phone:'',announcement:'',
  // Reference-only fields: NOT supported by PUT /portal-settings.
  description:'',footer_text:'',footer_link:'',is_active:true,
});

export default function PortalSettings(){
  const [selected,setSelected] = useState('portal-information');
  const [query,setQuery] = useState('');
  const [form,setForm] = useState({...referenceForm});
  const [logoPreview,setLogoPreview] = useState('');
  const [serverForm,setServerForm] = useState({...referenceForm});
  const [serverLogo,setServerLogo] = useState('');
  const [selectedLogo,setSelectedLogo] = useState(null);
  const fileInputRef = useRef(null);
  const [loadError,setLoadError] = useErrorDialogState('');

  useEffect(()=>{
    let alive=true;
    getPortalSettings().then(data=>{
      if(!alive)return;
      const values={...referenceForm};
      for(const key of ['portal_name','portal_tagline','contact_email','contact_phone','announcement']) {
        values[key]=String(data?.[key]?.value ?? '');
      }
      setForm(values);setServerForm(values);
      const logo=data?.portal_logo?.value;
      if(typeof logo==='string' && logo.trim()){setLogoPreview(logo);setServerLogo(logo);}
    }).catch(error=>{if(alive)setLoadError(apiError(error));});
    return ()=>{alive=false;};
  },[]);

  const allItems=useMemo(()=>SETTINGS_GROUPS.flatMap(group=>group.items),[]);
  const activeItem=allItems.find(item=>item.id===selected)||allItems[0];
  const visibleGroups=useMemo(()=>SETTINGS_GROUPS.map(group=>({
    ...group, items:group.items.filter(item=>item.label.toLowerCase().includes(query.toLowerCase()))
  })).filter(group=>group.items.length),[query]);

  const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const reset=()=>{setForm({...serverForm});setLogoPreview(serverLogo);setSelectedLogo(null);if(fileInputRef.current)fileInputRef.current.value='';};
  const chooseLogo=(event)=>{
    const file=event.target.files?.[0];
    if(!file) return;
    if(!['image/png','image/jpeg','image/svg+xml'].includes(file.type)){
      Swal.fire({icon:'error',title:'Unsupported file format',text:'Select a PNG, JPG or SVG image.'});return;
    }
    setSelectedLogo(file);
    const reader=new FileReader();
    reader.onload=()=>setLogoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };
  async function save(event){
    event.preventDefault();
    try{
      const changes=Object.fromEntries(['portal_name','portal_tagline','contact_email','contact_phone','announcement']
        .filter(key=>form[key]!==serverForm[key]).map(key=>[key,form[key]]));
      let result=null;
      if(Object.keys(changes).length)result=await savePortalSettings(selected,changes);
      if(selectedLogo)result=await uploadPortalLogo(selectedLogo);
      if(!result){await Swal.fire({icon:'info',title:'No changes',text:'No API-supported setting was changed.'});return;}
      setServerForm({...form});setSelectedLogo(null);
      await Swal.fire({icon:'success',title:'Settings updated',text:result.message||'Settings saved.'});
    }catch(error){await Swal.fire({icon:'error',title:'Unable to save settings',text:apiError(error)});}
  }
  return <main className="vim-institutions vim-portal-settings adm-modern container-fluid px-0">
    <MuHeader initials="⚙" title="Portal Settings" subtitle="System configuration and settings for VIWANDA Portal"/>
    
    <div className="vim-ps-layout">
      <aside className="vim-ps-nav adm-card" aria-label="All Settings">
        <h2><span className="vim-ps-blue-dot">·</span> All Settings</h2>
        <label className="vim-ps-search"><Search size={17}/>
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search settings..." aria-label="Search settings"/>
        </label>
        {visibleGroups.map(group=><div key={group.label} className="vim-ps-nav-group">
          <h3>{group.label}</h3>
          <div className="vim-ps-nav-items">{group.items.map(item=><button key={item.id}
            type="button" className={`vim-ps-nav-item ${selected===item.id?'selected':''}`}
            onClick={()=>setSelected(item.id)} aria-current={selected===item.id?'page':undefined}>
            <i className="vim-ps-nav-icon"><item.Icon size={15}/></i><span>{item.label}</span><ChevronRight size={16}/>
          </button>)}</div>
        </div>)}
        {!visibleGroups.length&&<p className="vim-ps-no-results">No matching settings.</p>}
      </aside>
      <section className="vim-ps-panel adm-card" aria-labelledby="vim-ps-active-title">
        <header className="vim-ps-header">
          <activeItem.Icon size={29} className="vim-ps-header-icon"/>
          <div><h2 id="vim-ps-active-title">{activeItem.label}</h2>
            <p>{selected==='portal-information'?'Configure basic information about the VIWANDA Portal.':'Configure '+activeItem.label.toLowerCase()+' for the VIWANDA Portal.'}</p>
          </div>
        </header>
        {selected==='portal-information'?<form onSubmit={save} className="vim-ps-form">
          <section className="vim-ps-form-card">
            <h3><span className="adm-dot" aria-hidden="true"/><Building2 size={18}/> Basic Information <MuBadge tone="green">Saved to the system</MuBadge></h3>
            <div className="vim-ps-basic-grid">
              <div className="vim-ps-inputs">
                <label><span>Portal Title <b>*</b></span><input required className="form-control" value={form.portal_name} onChange={e=>update('portal_name',e.target.value)}/></label>
                <label>Portal Tagline<input className="form-control" value={form.portal_tagline} onChange={e=>update('portal_tagline',e.target.value)}/></label>
                <label>Description<textarea className="form-control" rows={3} value={form.description} disabled title="Coming soon"/></label>
              </div>
              <div className="vim-ps-logo-area">
                <label>Portal Logo</label>
                <div className="vim-ps-logo-actions">
                  <div className="vim-ps-logo-box">{logoPreview?<img src={logoPreview} alt="Portal logo preview"/>:<span className="vim-ps-logo-empty">No logo selected</span>}</div>
                  <div className="vim-ps-logo-buttons">
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={chooseLogo} className="visually-hidden" aria-label="Select portal logo"/>
                    <button type="button" className="mu-btn" onClick={()=>fileInputRef.current?.click()}><Upload size={16}/> Change Logo</button>
                    <button type="button" className="mu-btn vim-ps-danger" disabled title="Remove Logo (coming soon)"><Trash2 size={16}/> Remove Logo</button>
                  </div>
                </div>
                <small>Recommended size: 300 x 100 px. Formats: PNG, JPG, SVG.</small>
              </div>
            </div>
          </section>
          <div className="vim-ps-api-note" role="status"><Info size={16}/> Portal Title, Tagline, Contact Email, Contact Phone, Announcement and Logo can be saved. Description, Footer and Portal Status will be available soon.</div>
          <section className="vim-ps-form-card">
            <h3><span className="adm-dot" aria-hidden="true"/><FileText size={18}/> Footer Information <MuBadge tone="grey">Coming soon</MuBadge></h3>
            <div className="vim-ps-footer-grid">
              <label>Footer Text<textarea className="form-control" rows={2} value={form.footer_text} disabled title="Coming soon"/></label>
              <label>Footer Links (Optional)<input className="form-control" type="url" value={form.footer_link} disabled title="Coming soon"/><small>Main website link (e.g. https://www.mit.go.tz)</small></label>
            </div>
          </section>
          <section className="vim-ps-form-card">
            <h3><span className="adm-dot" aria-hidden="true"/><Settings size={18}/> Portal Status <MuBadge tone="grey">Coming soon</MuBadge></h3>
            <div className="vim-ps-status-area">
              <strong>Portal Status</strong>
              <div className="vim-ps-radio-row vim-ps-status-cards">
                <label className={form.is_active?'on':''}><input type="radio" name="portal-active" checked={form.is_active} disabled title="Coming soon"/><span><b>Active</b><small>accessible to all authorized users</small></span></label>
                <label className={!form.is_active?'on':''}><input type="radio" name="portal-active" checked={!form.is_active} disabled title="Coming soon"/><span><b>Inactive</b><small>maintenance — only admins can sign in</small></span></label>
              </div>
              <div className={`vim-ps-state-note ${!form.is_active?'is-inactive':''}`}><CircleCheck size={19}/>
                {form.is_active?'The portal is currently active and accessible to all authorized users.':'The portal status cannot be changed yet.'}
              </div>
            </div>
          </section>
          <footer className="vim-ps-footer-actions">
            <button className="mu-btn" type="button" onClick={reset}><RotateCcw size={15}/> Reset</button>
            <button className="mu-btn mu-btn-primary" type="submit"><Save size={16}/> Save Changes</button>
          </footer>
        </form>:selected==='contact-information'?<form onSubmit={save} className="vim-ps-form">
          <section className="vim-ps-form-card"><h3><span className="adm-dot" aria-hidden="true"/><Contact size={18}/> Contact Information <MuBadge tone="green">Saved to the system</MuBadge></h3>
            <div className="vim-ps-footer-grid">
              <label>Contact Email<input className="form-control" type="email" value={form.contact_email} onChange={e=>update('contact_email',e.target.value)}/></label>
              <label>Contact Phone<input className="form-control" value={form.contact_phone} onChange={e=>update('contact_phone',e.target.value)}/></label>
              <label className="vim-ps-full-width">Announcement<textarea className="form-control" rows={3} value={form.announcement} onChange={e=>update('announcement',e.target.value)}/></label>
            </div>
          </section>
          <footer className="vim-ps-footer-actions"><button className="mu-btn" type="button" onClick={reset}><RotateCcw size={15}/> Reset</button>
            <button className="mu-btn mu-btn-primary" type="submit"><Save size={16}/> Save Changes</button></footer>
        </form>:selected==='system-preferences'?<PortalSystemPreferences/>:<div className="vim-ps-not-configured">
          <SlidersHorizontal size={30}/>
          <h3>{activeItem.label}</h3>
          <p>This setting is not available yet.</p>
        </div>}
      </section>
    </div>
  </main>;
}
