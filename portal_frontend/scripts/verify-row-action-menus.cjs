/** VIWANDA REV26: dependency-free regression test for table actions. */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const src = path.join(__dirname, '..', 'src');
const read = p => fs.readFileSync(path.join(src, p), 'utf8');
let checks=0;
function has(haystack,needle,msg){assert(haystack.includes(needle),msg||needle);checks++}
function absent(haystack,needle,msg){assert(!haystack.includes(needle),msg||needle);checks++}
const menu=read('components/common/RowActionsMenu.jsx');
has(menu,'<EllipsisVertical size={19}', 'single vertical-ellipsis trigger');
has(menu,'createPortal(', 'popup must be portal-mounted outside scrollable table');
has(menu,'className="vw-actions-popup"', 'shared action popup class');
has(menu,'aria-expanded={open}', 'accessible toggle');
has(menu,'event.key === "Escape"', 'Escape closes popup');
has(menu,'window.addEventListener("scroll"', 'scroll dismisses popup');
const css=read('styles/management.css');
has(css,'.vw-actions-popup{position:fixed;z-index:11000;display:flex;flex-direction:row;', 'horizontal overlay');
has(css,'.vw-actions-popup :is(button,a)', 'supports original action buttons and Links');
const datasets=read('pages/ModulePage/Datasets.jsx');
has(datasets,'<RowActionsMenu label={`Dataset actions for ${d.datasetName}`}>', 'Dataset action column uses menu');
absent(datasets,'<div className="ds-row-actions" role="group"', 'Dataset old exposed action group must be removed');
for(const fn of ['openExisting(d,2)','openExisting(d,0)','viewCalendar(d)','openExisting(d,1)','deactivate(d)'])has(datasets,fn,`Dataset original handler preserved: ${fn}`);
for(const name of ['View Details','Edit Dataset','View Reporting Calendar','Indicators & Targets','Deactivate Dataset'])has(datasets,name,`Dataset action label preserved: ${name}`);
has(datasets,'<RowActionsMenu label="Target actions">', 'Targets action menu');
has(datasets,'title="Edit Target Value"', 'Targets use icon button with accessible tooltip');
const pages=[
 ['pages/SubmissionPeriods/SubmissionPeriods.jsx','<RowActionsMenu label={`Reporting period actions for ${label(p)}`}>'],
 ['pages/Submissions/Submissions.jsx','<RowActionsMenu label={`Submission actions for ${item.dataset}`}>'],
 ['pages/Dashboard/Dashboard.jsx','<RowActionsMenu label={`Actions for ${row.dataset}`}>'],
 ['pages/ModulePage/ReferenceData.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/Users.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/Institutions.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/MinistryDepartments.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/InstitutionalAdmins.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/Delegations.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/ApprovalCircle.jsx','<RowActionsMenu label="Row actions">'],
 ['pages/Admin/RolesPermissions.jsx','<RowActionsMenu label="Row actions">'],
];
for(const [p,needle] of pages)has(read(p),needle,`${p} action cell`);
for(const fn of ['setModal({kind:\'view\',period:p})','openEdit(p)','closePeriod(p)'])has(read('pages/SubmissionPeriods/SubmissionPeriods.jsx'),fn,`period action handler preserved ${fn}`);
for(const txt of ['onClick={() => setDetail(item.id)}','to={`/dashboard/submissions/new?edit=${encodeURIComponent(item.id)}`}'])has(read('pages/Submissions/Submissions.jsx'),txt,'submission action preserved');
console.log(`PASS ${checks}/${checks} row-action menu regression assertions.`);
