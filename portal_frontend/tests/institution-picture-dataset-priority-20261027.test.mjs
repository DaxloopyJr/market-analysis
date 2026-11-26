import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {institutionLogoUrl,storagePathUrl,institutionLogoValidation,institutionLogoDimensionError} from '../src/utils/institutionLogo.js';
import {institutionLogo} from '../src/utils/mdoReviewRules.js';
import {orgPicture} from '../src/utils/orgCards.js';
import {datasetPriorityOf,priorityChangeError} from '../src/utils/datasetPriority.js';

test('one picture resolver: profile_image_url, else profile_image_path', () => {
  assert.equal(institutionLogoUrl({profile_image_url:'http://192.168.18.2:8000/storage/institutions/2/a.png'}),'http://192.168.18.2:8000/storage/institutions/2/a.png');
  assert.equal(institutionLogoUrl({profile_image_url:null,profile_image_path:'institutions/2/a.png'}),'/storage/institutions/2/a.png');
  assert.equal(institutionLogoUrl({profile_image_url:'http://localhost/storage/institutions/2/a.png'}),'/storage/institutions/2/a.png');
  assert.equal(institutionLogoUrl({profile_image_url:null,profile_image_path:null}),'');
  assert.equal(storagePathUrl('../etc/passwd'),'');
  assert.equal(institutionLogoUrl({profile_image_url:'javascript:alert(1)'}),'');
  const record={profile_image_path:'institutions/9/x.webp'};
  assert.equal(institutionLogo(record),'/storage/institutions/9/x.webp');
  assert.equal(orgPicture(record),'/storage/institutions/9/x.webp');
});
test('picture rules match Laravel (2048 KB, 2000 px, no SVG)', () => {
  assert.match(institutionLogoValidation({type:'image/svg+xml',size:10}),/JPG, PNG or WebP/);
  assert.match(institutionLogoValidation({type:'image/png',size:2048*1024+1}),/2 MB/);
  assert.equal(institutionLogoValidation({type:'image/webp',size:2048*1024}),'');
  assert.match(institutionLogoDimensionError(2001,500),/2000 x 2000/);
  assert.equal(institutionLogoDimensionError(2000,2000),'');
});
test('institution API uses POST /institutions/{id}/profile-image with profileImage', () => {
  const src=fs.readFileSync('src/API/institution.jsx','utf8');
  assert.match(src,/\/profile-image`/);
  assert.match(src,/body\.append\('profileImage', file/);
  assert.match(src,/\{profileImage: null\}/);
  assert.doesNotMatch(src,/append\('logo'/);
  assert.match(fs.readFileSync('vite.config.js','utf8'),/"\/storage": \{/);
});
test('dataset priority change rules (API #100)', () => {
  assert.equal(datasetPriorityOf({priority:'HIGH'}),'high');
  assert.equal(datasetPriorityOf({priority:null}),'');
  // Flag is never disabled: with no known priority the request goes to Laravel (which may answer 422).
  assert.equal(priorityChangeError({current:'',next:'low',reason:'x'}),'');
  assert.equal(datasetPriorityOf({priority:{code:'MEDIUM'}}),'medium');
  assert.match(priorityChangeError({current:'high',next:'high',reason:'x'}),/different/);
  assert.match(priorityChangeError({current:'high',next:'low',reason:'  '}),/required/);
  assert.match(priorityChangeError({current:'high',next:'low',reason:'a'.repeat(2001)}),/2000/);
  assert.equal(priorityChangeError({current:'high',next:'medium',reason:'Ministry plan'}),'');
  const api=fs.readFileSync('src/API/dataset.jsx','utf8');
  assert.match(api,/api\.patch\(`\$\{ds\(id\)\}\/priority`,\{priority,reason\}\)/);
  const mdo=fs.readFileSync('src/pages/MDO/MdoWorkspace.jsx','utf8');
  assert.match(mdo,/datasetsAPI\.updatePriority\(row\.id/);
  assert.doesNotMatch(mdo,/disabled=\{!priority\}/);
  assert.match(mdo,/datasetsAPI\.get\(row\.id\)/);
});
