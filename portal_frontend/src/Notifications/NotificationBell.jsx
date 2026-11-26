import {useErrorDialogState,showUserFacingError} from '../utils/userFacingErrors.js';
/**
 * VIWANDA notification bell dropdown (not navigation).
 * GET /notifications lists only the signed-in user's messages.
 * PATCH /notifications/{id}/read marks a message read after user click.
 * The dropdown shows unread only and links to a related submission when identifiable.
 */
import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Bell,Check,ChevronRight,Inbox,X} from 'lucide-react';
import {getNotifications,getNotification,markNotificationRead} from '../API/notifications';
import {notificationTarget} from '../utils/notificationTargets.js';
import {apiError} from '../API/resourceHelpers';
import {showPortalToast} from '../utils/portalAlerts';

function when(value){
  if(!value)return '';
  const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
export default function NotificationBell({unreadCount=0,user}) {
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
  const [items,setItems]=useState([]),[error,setError]=useErrorDialogState(''),[openingId,setOpeningId]=useState(null);
  const holder=useRef(null),navigate=useNavigate();
  useEffect(()=>{
    if(!open)return undefined;
    const onOutside=event=>{if(holder.current&&!holder.current.contains(event.target))setOpen(false);};
    const onKey=event=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',onOutside);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onKey);};
  },[open]);
  useEffect(()=>{
    if(!open)return undefined;
    let live=true;setLoading(true);setError('');
    getNotifications({page:1,perPage:6,isRead:false}).then(response=>{
      if(live)setItems(Array.isArray(response.data)?response.data.filter(item=>!item.isRead):[]);
    }).catch(err=>{if(live)setError(apiError(err));})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[open]);
  async function openMessage(item) {
    if(openingId!==null)return;
    setOpeningId(item.id);
    try{
      // Detail may contain submissionId even when the list omitted it.
      let detail=item;
      try{detail={...item,...(await getNotification(item.id))};}
      catch{ /* Still allow the user to read the notification itself. */ }
      if(!item.isRead)await markNotificationRead(item.id);
      // Only after a confirmed PATCH does the unread bell list lose the row.
      setItems(current=>current.filter(row=>row.id!==item.id));
      setOpen(false);
      const target=notificationTarget(detail,user);
      if(target)navigate(target.pathname+(target.search??''),{state:target.state});
      else navigate('/dashboard/notifications',{state:{notificationId:item.id}});
    }catch(err){
      await showUserFacingError(err,'Unable to open notification');
    }finally{setOpeningId(null);}
  }
  return <div className="portal-bell-wrap" ref={holder}>
    <button type="button" className="portal-topbar-icon-button portal-topbar-notifications"
      onClick={()=>setOpen(value=>!value)} aria-expanded={open} aria-haspopup="dialog"
      aria-controls="viwanda-notification-popover" aria-label="Open notification dropdown" title="Notifications">
      <Bell size={19} aria-hidden="true"/>
      {unreadCount>0&&<span className="portal-unread-badge">{unreadCount>99?'99+':unreadCount}</span>}
    </button>
    {open&&<section id="viwanda-notification-popover" className="portal-bell-popover" role="dialog" aria-label="Recent notifications">
      <div className="portal-bell-popover-head"><div><strong>Notifications</strong><small>{unreadCount} unread</small></div>
        <button aria-label="Close notifications" type="button" className="portal-bell-close" onClick={()=>setOpen(false)}><X size={17}/></button></div>
      <div className="portal-bell-popover-list">
        {loading?<p className="portal-bell-empty" role="status">Loading notifications…</p>:
          error?<div className="portal-bell-empty">Unable to load notifications. Reopen to retry.</div>:
          !items.length?<div className="portal-bell-empty"><Inbox size={22}/> No unread notifications</div>:
          items.map(item=><button type="button" disabled={openingId!==null} className="portal-bell-item unread" key={item.id} onClick={()=>openMessage(item)}>
            <span className="portal-bell-item-icon"><Bell size={15}/></span><span className="portal-bell-item-body"><strong>{item.type||'Portal notification'}</strong><span>{item.message||'No message supplied'}</span><small>{when(item.createdAt)}</small></span>
            {!item.isRead&&<i className="portal-bell-unread-dot" aria-label="Unread"/>}
          </button>)}
      </div>
      <Link className="portal-bell-view-all" to="/dashboard/notifications" onClick={()=>setOpen(false)}>View all notifications <ChevronRight size={16}/></Link>
    </section>}
  </div>;
}
