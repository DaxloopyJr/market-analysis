/**
 * CONFIRMED Laravel notifications contract (active authenticated user only):
 * GET /notifications?isRead=0|1&perPage=20&page=1 -> {data,links,meta}
 * GET /notifications/unread-count -> {data:{unreadCount}}
 * GET /notifications/{id} -> {data:{id,type,message,isRead,...}}
 * PATCH /notifications/{id}/read -> {data:{...,isRead:true}}, no body.
 * Laravel decides when to create and route a notification to the next approver;
 * the frontend only reads and marks its OWN notifications.
 */
import api from './axios';
const checkId = value => {
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid notification ID.');
  return id;
};
export function getNotifications({isRead,page=1,perPage=20}={}) {
  return api.get('/notifications',{params:{page,perPage,...(isRead===undefined?{}:{isRead:isRead?1:0})}}).then(response=>response.data);
}
export function getUnreadNotificationCount() {
  return api.get('/notifications/unread-count').then(response=>Number(response.data?.data?.unreadCount??0));
}
export function getNotification(id) {
  return api.get(`/notifications/${checkId(id)}`).then(response=>response.data?.data);
}
export async function markNotificationRead(id) {
  const response=await api.patch(`/notifications/${checkId(id)}/read`);
  if(response.data?.data?.isRead!==true)throw new Error('The system did not confirm that the notification is read.');
  if(typeof window!=='undefined')window.dispatchEvent(new Event('viwanda:notifications:updated'));
  return response.data.data;
}
