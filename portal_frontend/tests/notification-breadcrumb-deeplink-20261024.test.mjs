import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notificationSubmissionId, notificationTarget} from '../src/utils/notificationTargets.js';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const user=code=>({roles:[{code}]});

test('uses a real submission ID; never treats auditEventId as one',()=>{
  assert.equal(notificationSubmissionId({id:19,auditEventId:44,type:'submission_reviewed'}),null);
  assert.equal(notificationSubmissionId({data:{submissionId:152}}),152);
  assert.equal(notificationSubmissionId({subjectType:'submission',subjectId:'99'}),99);
  assert.equal(notificationSubmissionId({message:'Submission SUB-00152 is ready for your review'}),152);
  assert.equal(notificationSubmissionId({message:'Please review your submissions'}),null);
  assert.equal(notificationSubmissionId({subjectType:'institution',subjectId:7}),null);
});

test('routes known submission references to the correct role-specific workspace',()=>{
  const item={submissionId:152};
  assert.deepEqual(notificationTarget(item,user('MDD')),{pathname:'/dashboard/mdd/review/152'});
  assert.deepEqual(notificationTarget(item,user('MDO')),{pathname:'/dashboard/mdo/review/152'});
  assert.deepEqual(notificationTarget(item,user('HOD')),{pathname:'/dashboard/hod/review/152'});
  assert.deepEqual(notificationTarget(item,user('AO')),{pathname:'/dashboard/ao/pending',state:{focusSubmissionId:152}});
  assert.deepEqual(notificationTarget({...item,message:'Returned for correction'},user('IDO')),
    {pathname:'/dashboard/submissions/returned',search:'?detail=152'});
  assert.deepEqual(notificationTarget(item,user('DDO')),
    {pathname:'/dashboard/submissions/my',search:'?detail=152'});
  assert.equal(notificationTarget({auditEventId:1},user('MDO')),null);
  assert.equal(notificationTarget(item,user('MOA')),null);
});

test('notification bell only loads unread messages, removes after confirmed PATCH and deep links',()=>{
  const bell=read('src/components/NotificationBell.jsx');
  assert.match(bell,/getNotifications\(\{page:1,perPage:6,isRead:false\}\)/);
  assert.match(bell,/await markNotificationRead\(item\.id\)/);
  assert.match(bell,/setItems\(current=>current\.filter\(row=>row\.id!==item\.id\)\)/);
  assert.match(bell,/notificationTarget\(detail,user\)/);
  assert.match(bell,/navigate\(target\.pathname\+/);
  assert.match(read('src/components/Topbar.jsx'),/unreadCount=\{unreadCount\} user=\{user\}/);
});

test('MDO and MDD use the same compact blue animated breadcrumb with reduced-motion support',()=>{
  const css=read('src/pages/MDO/MdoWorkspace.css');
  assert.match(css,/\.mdo-breadcrumb::before/);
  assert.match(css,/@keyframes mdo-crumb-glide/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(read('src/pages/MDD/MddWorkspace.jsx'),/Breadcrumb/);
});
