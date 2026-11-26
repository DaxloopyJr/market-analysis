/**
 * Report catalogue (REPORT_RECOMMENDATIONS 28 Oct 2026; linked to Laravel /reports/* on 8 Nov 2026).
 * group: 'exec' = Taarifa za Viongozi (executive pack), 'me' = M&E performance, 'ops' = submission & workflow.
 * api  : the Laravel report slug (GET /reports/{api}); view: 'standard' (ReportView) or 'brief' / 'annual' (ExecutiveReport).
 * Titles and descriptions are bilingual; Kiswahili is the default language of every report document.
 * Who may open a report: GET /reports/catalog (Laravel, reports.view.{slug}) when it has loaded; the permission
 * reading below is only the fallback while it loads or when it cannot be reached.
 */
const T = (sw, en) => ({sw, en});

export const REPORTS = [
  // ---------- A. Taarifa za Viongozi ----------
  {id:'executive-brief', api:'annual-me', view:'brief', no:'E1', group:'exec', tone:'navy',
    title:T('Muhtasari wa Utendaji kwa Viongozi', 'Executive Performance Brief'),
    description:T('Kurasa mbili: namba kuu, mwelekeo dhidi ya mwaka uliopita, taasisi zinazoongoza na zinazohitaji msukumo.',
      'Two pages: headline figures, change from last year, leading institutions and those needing support.')},
  {id:'annual-me', api:'annual-me', view:'annual', no:'E2', group:'exec', tone:'navy',
    title:T('Taarifa ya Mwaka ya Ufuatiliaji na Tathmini', 'Annual Consolidated M&E Report'),
    description:T('Taarifa kamili ya Wizara: malengo ya kimkakati, bajeti, Idara na Vitengo, Taasisi, changamoto na hitimisho.',
      'Full Ministry report: strategic objectives, budget, departments and units, institutions, challenges and conclusion.')},

  // ---------- B. Ufuatiliaji na Tathmini (M&E) ----------
  {id:'indicator-performance', api:'indicator-performance', view:'standard', no:8, group:'me', tone:'blue',
    title:T('Utendaji wa Viashiria', 'Indicator Performance'),
    description:T('Kiwango cha msingi, lengo, utekelezaji halisi, asilimia ya utekelezaji na daraja kwa kila kiashiria.',
      'Baseline, target, actual, achievement % and rating per indicator.')},
  {id:'quarterly-trend', api:'quarterly-trend', view:'standard', no:9, group:'me', tone:'blue',
    title:T('Mwenendo wa Utendaji kwa Robo Mwaka', 'Quarterly Performance & Trend'),
    description:T('Utekelezaji wa kila robo na wa jumla tangu mwanzo wa mwaka.', 'Quarterly and cumulative performance across the year.')},
  {id:'strategic-objective', api:'strategic-objective', view:'standard', no:10, group:'me', tone:'green',
    title:T('Utendaji kwa Malengo ya Kimkakati', 'Strategic Objective Performance'),
    description:T('Matokeo yaliyojumuishwa kwa kila lengo la kimkakati (A–Y).', 'Weighted results under each strategic objective (A–Y).')},
  {id:'organisation-performance', api:'organisation-performance', view:'standard', no:11, group:'me', tone:'green',
    title:T('Utendaji wa Taasisi, Idara na Vitengo', 'Institution, Department & Unit Performance'),
    description:T('Ulinganisho na mpangilio wa utendaji kwa taasisi au idara.', 'Comparative delivery and ranking by institution or department.')},
  {id:'sector-performance', api:'sector-performance', view:'standard', no:12, group:'me', tone:'indigo',
    title:T('Utendaji wa Sekta', 'Sector & Subsector Performance'),
    description:T('Matokeo ya viashiria vya sekta za Viwanda, Biashara na SMEs.', 'Published sector indicator results: industry, trade and SMEs.')},
  {id:'target-exceptions', api:'target-exceptions', view:'standard', no:13, group:'me', tone:'red',
    title:T('Maeneo Yanayohitaji Msukumo', 'Target Variance & Exceptions'),
    description:T('Viashiria vilivyo chini ya lengo, visivyotekelezwa, visivyo na lengo au vilivyovuka lengo kwa kiasi kikubwa.',
      'Below target, zero delivery, missing targets or actuals and unusual overachievement.')},
  {id:'budget-delivery', api:'budget-delivery', view:'standard', no:14, group:'me', tone:'amber',
    title:T('Matumizi ya Bajeti dhidi ya Utekelezaji', 'Budget Utilisation vs Delivery'),
    description:T('Bajeti iliyoidhinishwa, fedha zilizopokelewa, matumizi na utekelezaji halisi.', 'Approved budget, funds received, expenditure and physical delivery.')},

  // ---------- C. Uwasilishaji na Uidhinishaji ----------
  {id:'data-submission', api:'data-submission', view:'standard', no:1, group:'ops', tone:'blue',
    title:T('Taarifa ya Uwasilishaji wa Data', 'Data Submission Report'),
    description:T('Data zilizowasilishwa kwa taasisi, kipindi, tarehe ya mwisho, siku za kuchelewa na hali.', 'Submitted datasets by institution and period, deadlines, days late and status.')},
  {id:'submission-compliance', api:'submission-compliance', view:'standard', no:2, group:'ops', tone:'amber',
    title:T('Uzingatiaji wa Uwasilishaji', 'Submission Compliance'),
    description:T('Taarifa zilizotarajiwa dhidi ya zilizowasilishwa kwa wakati, kwa kuchelewa au bado.', 'Expected returns against on-time, late and outstanding returns.')},
  {id:'outstanding-overdue', api:'outstanding-overdue', view:'standard', no:3, group:'ops', tone:'red',
    title:T('Taarifa Zilizochelewa na Ambazo Bado', 'Outstanding & Overdue Submissions'),
    description:T('Taarifa ambazo hazijawasilishwa, siku zilizochelewa na maafisa wanaohusika.', 'Unsubmitted returns, days overdue and responsible officers.')},
  {id:'approval-turnaround', api:'approval-turnaround', view:'standard', no:4, group:'ops', tone:'indigo',
    title:T('Muda wa Uidhinishaji na Uchapishaji', 'Approval & Publication Turnaround'),
    description:T('Muda kutoka uwasilishaji hadi mapitio, uidhinishaji na uchapishaji.', 'Time from submission to review, approval and publication.')},
  {id:'returned-corrections', api:'returned-corrections', view:'standard', no:5, group:'ops', tone:'amber',
    title:T('Taarifa Zilizorudishwa kwa Marekebisho', 'Returned-for-Correction Report'),
    description:T('Sababu za kurudishwa, muda wa marekebisho na urudishaji unaojirudia.', 'Return reasons, correction deadlines and repeated returns.')},
  {id:'published-register', api:'published-register', view:'standard', no:6, group:'ops', tone:'blue', previewer:true,
    title:T('Rejista ya Data Zilizochapishwa', 'Published Data Register'),
    description:T('Kila taarifa iliyochapishwa pamoja na toleo, tarehe na kumbukumbu yake.', 'Every published return with revision, date and source reference.')},
  {id:'data-quality', api:'data-quality', view:'standard', no:7, group:'ops', tone:'red',
    title:T('Ubora wa Data na Ukaguzi', 'Data Quality & Audit'),
    description:T('Ukamilifu wa data, viashiria vilivyokosekana na marekebisho yanayojirudia.', 'Completeness, missing indicators and repeated corrections.')},
];

export const REPORT_GROUPS = [
  {key:'exec', title:T('A. Taarifa za Viongozi', 'A. Executive reports'), note:T('Kwa Waziri, Katibu Mkuu na Wakurugenzi', 'For the Minister, Permanent Secretary and Directors')},
  {key:'me', title:T('B. Ufuatiliaji na Tathmini', 'B. M&E performance reports'), note:T('Uchambuzi wa utendaji', 'Performance analysis')},
  {key:'ops', title:T('C. Uwasilishaji na Uidhinishaji', 'C. Submission & workflow reports'), note:T('Ufuatiliaji wa kiutendaji', 'Operational follow-up')},
];

const has = (user, codes) => {
  const granted = new Set((user?.permissions ?? []).map(p => (typeof p === 'string' ? p : p?.code ?? p?.name)));
  return codes.some(code => granted.has(code));
};

/**
 * Who may open a report. `allowedSlugs` = the slugs returned by GET /reports/catalog (authoritative).
 * Without it: M&E reports (and the Published Data Register) need published-analytics or report access;
 * operational workflow reports need a ministry workflow/report permission (MDO / MDD / MOA).
 */
export function reportAudience(report, user, allowedSlugs = null) {
  if (allowedSlugs) return allowedSlugs.has(report.api);
  const meAccess = has(user, ['analytics.view.published', 'analytics.view.ministry', 'reports.view.ministry', 'reports.view.institution', 'reports.view.own']);
  const opsAccess = has(user, ['reports.view.ministry'])
    || [user?.role_code, ...(user?.roles ?? []).map(r => (typeof r === 'string' ? r : r?.code))]
      .some(code => ['MOA', 'MDO', 'MDD'].includes(String(code ?? '').toUpperCase()));
  if (report.group === 'me' || report.group === 'exec' || report.previewer) return meAccess || opsAccess;
  return opsAccess;
}

export const reportById = id => REPORTS.find(report => report.id === id) ?? null;
/** Old report links (before 8 Nov 2026) keep working. */
export const LEGACY_REPORT_IDS = {'strategic-objectives':'strategic-objective', 'variance-exception':'target-exceptions',
  'annual-consolidated':'annual-me', 'turnaround':'approval-turnaround', 'returned-correction':'returned-corrections'};
export const reportTitle = (report, lang = 'sw') => report?.title?.[lang] ?? report?.title?.sw ?? '';
