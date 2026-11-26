import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {institutionLogoUrl,institutionLogoValidation} from '../src/utils/institutionLogo.js';
const src=file=>readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');

test('Institution logo: aliases and URL validation never show unsafe image sources',()=>{
 assert.equal(institutionLogoUrl({logo_url:'https://portal.gov.tz/media/test.png'}),'https://portal.gov.tz/media/test.png');
 assert.equal(institutionLogoUrl({logoUrl:'/storage/logos/demo.png'}),'/storage/logos/demo.png');
 assert.equal(institutionLogoUrl({logo:{url:'https://example.org/logo.png'}}),'https://example.org/logo.png');
 assert.equal(institutionLogoUrl({logo_url:'javascript:alert(1)'}),'');
 assert.equal(institutionLogoUrl({logo_url:'//untrusted.example/x.png'}),'');
 assert.equal(institutionLogoUrl({logo_url:'data:image/svg+xml,abc'}),'');
});

test('Logo picker checks file mime and size',()=>{
 assert.equal(institutionLogoValidation(null),'');
 assert.equal(institutionLogoValidation({type:'image/png',size:2048}),'');
 assert.match(institutionLogoValidation({type:'application/pdf',size:2}),/JPG, PNG or WebP/);
 // 27 Oct 2026: Laravel rule is 2048 KB (API reference #24).
 assert.match(institutionLogoValidation({type:'image/png',size:6*1024*1024}),/2 MB/);
});

test('Institution API keeps JSON details and uploads the picture via /profile-image (27 Oct 2026)',()=>{
 const code=src('API/institution.jsx');
 assert.match(code,/api\.post\(ROOT, institutionPayload\(form, true\)\)/);
 assert.match(code,/api\.put\(route\(id\), institutionPayload\(form\)\)/);
 assert.match(code,/\/profile-image`/);
 assert.match(code,/body\.append\('profileImage', file, file\.name\)/);
 assert.match(code,/logo_url: institutionLogoUrl\(record\)/);
});

test('Institution Management shows logo picker, preview, and logo table column',()=>{
 const code=src('pages/Admin/Institutions.jsx');
 assert.match(code,/<th>#<\/th><th>Logo<\/th>/);
 assert.match(code,/alt="Institution logo preview"/);
 assert.match(code,/type="file" accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(code,/logoFile/);
});

test('Submission UI omits developer notices and displays errors in dismissible SweetAlert2',()=>{
 const code=src('pages/DataEntry/DataEntry.jsx');
 const error=src('utils/userFacingErrors.js');
 const flow=src('utils/submissionWorkflowTrace.js');
 assert.doesNotMatch(code,/Drafts are stored under their own Submission ID/);
 assert.doesNotMatch(code,/alert alert-danger ido-wizard-alert/);
 assert.doesNotMatch(code,/\{periodError&&<div/);
 assert.doesNotMatch(code,/\{indicatorError && <p/);
 assert.match(code,/showUserFacingError\(message/);
 assert.match(error,/showCloseButton: true/);
 assert.match(error,/confirmButtonText: 'Close'/);
 assert.match(flow,/failure\.response = error\?\.response/);
 assert.doesNotMatch(flow,/`\[\$\{stage\}\]/);
});
