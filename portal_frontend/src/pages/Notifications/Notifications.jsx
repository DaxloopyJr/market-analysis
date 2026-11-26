import {useErrorDialogState} from '../../utils/userFacingErrors.js';
/**
 * VIWANDA Portal notifications workspace (same navy/blue/light panels as the
 * established admin dashboard). The topbar bell is a separate small dropdown.
 * Backend confirmed: GET /notifications, GET /notifications/unread-count,
 * GET /notifications/{id}, PATCH /notifications/{id}/read.
 * These endpoints only expose the authenticated user's notifications.
 */
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Bell,Check,CheckCheck,ChevronLeft,ChevronRight,Clock3,Inbox,RefreshCw,Search,MailOpen,Mail} from 'lucide-react';
import {MuBadge,MuCard,MuHeader,MuKpi,MuSkeleton,MuTabs} from '../../components/modern/ModernUI.jsx';
import {MuDonutLegend} from '../../components/modern/RoleParts.jsx';
import {humanize} from '../../utils/auditDisplay.js';
import {notificationKind} from '../../utils/notificationDisplay.js';
import {getNotifications,getNotification,getUnreadNotificationCount,markNotificationRead} from '../../API/notifications';
import {apiError} from '../../API/resourceHelpers';
import {showPortalToast} from '../../utils/portalAlerts';
import './Notifications.css';
import PageSizeSelect from '../../components/common/PageSizeSelect.jsx';
import {usePageSize} from '../../components/common/usePageSize.js';
import {fetchUiPage} from '../../utils/pagedFetch.js';

const KIND_COLORS={returned:'#d92d20',reminder:'#e0b400',published:'#1eb53a',workflow:'#0b5bd3'};
const titleOf=row=>row?.title||(row?.type?humanize(String(row.type).split('\\').pop()):'Notification');
const formatDate = value => {const date=new Date(value);return value&&!Number.isNaN(date.getTime())?date.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';};
export default function Notifications(){
  const location=useLocation();
  const [rows,setRows]=useState([]),[page,setPage]=useState(1),[filter,setFilter]=useState('all');
  const [query,setQuery]=useState(''),[meta,setMeta]=useState({}),[selected,setSelected]=useState(null);
  const [unreadCount,setUnreadCount]=useState(0),[busy,setBusy]=useState(false),[allTotal,setAllTotal]=useState(null);
  const [pageSize,setPageSize]=usePageSize('notifications',20);
  const [error,setError]=useErrorDialogState(''),[reload,setReload]=useState(0);
  const refresh=useCallback(()=>setReload(n=>n+1),[]);
  useEffect(()=>{
    let alive=true;setBusy(true);setError('');
    Promise.all([fetchUiPage(async(serverPage,perPage)=>{const r=await getNotifications({page:serverPage,perPage,...(filter==='all'?{}:{isRead:filter==='read'})});return {items:Array.isArray(r?.data)?r.data:[],total:Number(r?.meta?.total??0),lastPage:Number(r?.meta?.last_page??1),meta:r?.meta};},page,pageSize),getUnreadNotificationCount()])
      .then(([result,count])=>{if(!alive)return;
        if(filter==='all')setAllTotal(result.total);setRows(result.items);setMeta({...(result.meta||{}),total:result.total,last_page:result.lastPage,per_page:pageSize});setUnreadCount(count);
      }).catch(err=>{if(alive)setError(apiError(err));})
      .finally(()=>{if(alive)setBusy(false);});
    return()=>{alive=false;};
  },[page,pageSize,filter,reload]);
  useEffect(()=>{
    const requested=Number(location.state?.notificationId);
    if(!Number.isSafeInteger(requested)||requested<=0)return;
    let alive=true;
    getNotification(requested).then(row=>{if(alive)setSelected(row);}).catch(err=>{if(alive)setError(apiError(err));});
    return()=>{alive=false;};
  },[location.state?.notificationId]);
  const filtered=useMemo(()=>rows.filter(row=>[row.type,row.message,String(row.id)].join(' ').toLowerCase().includes(query.trim().toLowerCase())),[rows,query]);
  const total=Number(meta.total??rows.length),lastPage=Math.max(1,Number((meta.last_page??meta.lastPage??Math.ceil(total/20))||1));
  async function selectNotification(row){
    try{setError('');setSelected(await getNotification(row.id));}
    catch(e){setError(apiError(e));}
  }
  async function markRead(){
    if(!selected||selected.isRead)return;
    try{
      setBusy(true);setError('');
      const updated=await markNotificationRead(selected.id);
      setSelected(updated);refresh();
      showPortalToast({type:'success',title:'Notification marked as read'});
    }catch(e){setError(apiError(e));}
    finally{setBusy(false);}
  }
  const everything=allTotal??total;
  const readCount=Math.max(0,everything-unreadCount);
  const kinds=['returned','reminder','published','workflow'].map(key=>({key,count:rows.filter(row=>notificationKind(row).key===key).length}));
  const selectedKind=selected?notificationKind(selected):null;
  const pick=value=>{setFilter(value);setPage(1);};
  return <div className="vi-notifications mu-page container-fluid px-0">
    <MuHeader initials="🔔" title="Notifications" subtitle="Updates, submission reminders and review actions for your account">
      <button className="mu-btn" type="button" onClick={refresh}><RefreshCw size={15}/> Refresh</button>
    </MuHeader>
    <div className="mu-kpis vi-notification-kpis">
      <MuKpi tone="blue" icon={<Bell size={18}/>} title="All notifications" value={`${everything} notification${everything===1?'':'s'}`} note="on your account" arrow={false} onOpen={()=>pick('all')}/>
      <MuKpi tone="amber" icon={<Mail size={18}/>} title="Unread" value={`${unreadCount} unread`} note={unreadCount?'need your attention':'all caught up'} arrow={false} onOpen={()=>pick('unread')}/>
      <MuKpi tone="green" icon={<MailOpen size={18}/>} title="Read" value={`${readCount} read`} note="already opened" arrow={false} onOpen={()=>pick('read')}/>
    </div>
    <div className="vi-notifications-columns mu-review-grid">
      <MuCard title="My Notifications" count={total} className="vi-notifications-panel">
        <div className="mu-toolbar vi-notifications-toolbar">
          <MuTabs label="Notification filters" value={filter} onChange={pick} items={[{key:'all',label:'All',count:everything},{key:'unread',label:'Unread',count:unreadCount},{key:'read',label:'Read',count:readCount}]}/>
          <label className="mu-search vi-notification-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search notifications" placeholder="Search messages..."/></label>
        </div>
        {busy&&!rows.length?<MuSkeleton kind="list" rows={6} label="Loading notifications…"/>:
          !filtered.length?<div className="vi-notification-empty"><Inbox size={30}/><strong>No notifications found</strong><span>Try another filter or refresh this page.</span></div>:
          <div className="vi-notification-list">{filtered.map(row=>{const kind=notificationKind(row);return <button key={row.id} type="button" className={`vi-notification-row ${row.isRead?'':'unread'} ${selected?.id===row.id?'selected':''}`} onClick={()=>selectNotification(row)}>
            <span className={`vi-notification-icon vi-kind-${kind.tone}`}><kind.Icon size={16}/></span>
            <span className="vi-notification-message"><strong>{titleOf(row)}<MuBadge tone={kind.tone}>{kind.label}</MuBadge></strong><span>{row.message||'No message provided.'}</span><small><Clock3 size={12}/>{formatDate(row.createdAt)}</small></span>
            {!row.isRead&&<span className="vi-notification-dot" aria-label="Unread"/>}
          </button>;})}</div>}
        <div className="vi-notifications-pagination mu-table-foot"><span>Showing {filtered.length} of {total}</span><div><PageSizeSelect value={pageSize} onChange={v=>{setPageSize(v);setPage(1);}}/><button type="button" aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button><span className="vi-page-of">{page} / {lastPage}</span><button type="button" aria-label="Next page" disabled={page>=lastPage} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button></div></div>
      </MuCard>
      <aside>
        <MuCard title="Notification Details" className="vi-notification-detail" tag={selected?(selected.isRead?'Read':'Unread'):undefined}>
          {selected?<div className="vi-notification-detail-body">
            <span className={`vi-notification-detail-symbol vi-kind-${selectedKind.tone}`}><selectedKind.Icon size={22}/></span><h2>{titleOf(selected)}</h2><p>{selected.message||'No message provided.'}</p>
            <dl><dt>Type</dt><dd>{selectedKind.label}</dd><dt>Received</dt><dd>{formatDate(selected.createdAt)}</dd><dt>Status</dt><dd>{selected.isRead?'Read':'Unread'}</dd><dt>Notification ID</dt><dd>#{selected.id}</dd></dl>
            {!selected.isRead?<button disabled={busy} type="button" className="mu-btn mu-btn-primary vi-mark-read" onClick={markRead}><CheckCheck size={15}/> Mark as Read</button>:<div className="vi-notification-read"><Check size={16}/> This notification has been read.</div>}
          </div>:<div className="vi-notification-detail-placeholder"><Inbox size={30}/><strong>Choose a notification</strong><span>Its full message and details will appear here.</span></div>}
        </MuCard>
        {rows.length>0&&<MuCard title={total>rows.length?'By type (this page)':'By type'} tag="Pie">
          <MuDonutLegend centerLabel="shown" center={rows.length} data={kinds.map(k=>({name:k.key==='reminder'?'Reminders':k.key==='workflow'?'Workflow':k.key.charAt(0).toUpperCase()+k.key.slice(1),value:k.count,color:KIND_COLORS[k.key]}))}/>
        </MuCard>}
      </aside>
    </div>
  </div>;
}
