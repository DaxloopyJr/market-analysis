import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file)=>readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
const pages={
  hod:source('pages/HOD/HodReview.jsx'),
  inbox:source('pages/HOD/HodInbox.jsx'),
  ao:source('pages/AO/AoApprovals.jsx'),
  mdo:source('pages/MDO/MdoWorkspace.jsx'),
  datasets:source('pages/ModulePage/Datasets.jsx'),
  users:source('pages/Admin/Users.jsx'),
  notifications:source('pages/Notifications/Notifications.jsx'),
};
test('HOD correction reason failure uses a dismissible dialog and not a page error banner',()=>{
  assert.match(pages.hod,/Write a reason for the HOD correction before forwarding changed values/);
  assert.match(pages.hod,/\[error,setError\]=useErrorDialogState\(''\)/);
  assert.doesNotMatch(pages.hod,/\{error&&<div className="alert alert-danger/);
});
test('Global error dialog shows safe message and Close button',()=>{
  const util=source('utils/userFacingErrors.js');
  assert.match(util,/confirmButtonText: 'Close'/);
  assert.match(util,/text: userFacingErrorMessage\(error\)/);
  assert.match(util,/useErrorDialogState/);
});
test('AO, MDO and HOD inbox do not render raw backend error banners',()=>{
  assert.match(pages.ao,/useErrorDialogState/);
  assert.match(pages.mdo,/useErrorDialogState/);
  assert.match(pages.inbox,/useErrorDialogState/);
  assert.doesNotMatch(pages.ao,/className="ao-error"/);
  assert.doesNotMatch(pages.mdo,/className="mdo-error"/);
});
test('Dataset API failure triggers dialog but numeric/field validation remains at input',()=>{
  assert.match(pages.datasets,/showUserFacingError\(err/);
  assert.match(pages.datasets,/rowError = \(fields,k\)/);
  assert.doesNotMatch(pages.datasets,/<Banner tone="warning">\{error\}<\/Banner>/);
});
test('User management and notification failures are not echoed as in-page red banners',()=>{
  assert.match(pages.users,/useErrorDialogState/);
  assert.match(pages.notifications,/useErrorDialogState/);
  assert.doesNotMatch(pages.users,/\{error && <div className="alert alert-danger/);
  assert.doesNotMatch(pages.notifications,/\{error&&<div className="alert alert-danger/);
});
