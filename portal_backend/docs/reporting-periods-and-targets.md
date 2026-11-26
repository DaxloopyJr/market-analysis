# Reporting periods na indicator targets

## Flow ya sasa ya dataset master — 21 Oktoba 2026

Dataset ina details, frequencies, indicators na dimensions zinazoreuse kila mwaka. Activation haihitaji reporting year, calendar au target. Template mpya ina `schemaVersion: 3` na haina reportingCalendar; versions za zamani hazibadilishwi. Targets ni mipango ya kipindi, si sehemu ya activation.

### Reporting settings za kudumu

`PUT {{baseUrl}}/datasets/{datasetId}/reporting-settings`

```json
{
  "responsibleUserId": 7,
  "yearType": "financial",
  "yearStartMonth": 7,
  "deadlineDays": 0,
  "reminderDays": [10],
  "remindersEnabled": true
}
```

Officer lazima awe active IDO/DDO wa dataset. Settings zinaweza kuwekwa kabla au baada ya activation; hazihitaji kuedit master kila mwaka. Calendar year lazima yearStartMonth iwe 1. GET endpoint hiyo husoma settings. Settings zinatumika kwa calendars mpya; zilizopo zinahifadhi overrides, officer, deadlines na submission state zake. Tumia endpoint ya reporting-calendar kuhariri assignments zilizopo ambazo hazijasubmitiwa. Dataset GET pia ina reportingSettings.

### Kupata maafisa wa kuassign

`GET {{baseUrl}}/datasets/{datasetId}/assignees` hurudisha watumiaji active wanaoweza kuassigniwa kwenye dataset: IDO wa taasisi kwa dataset isiyo na department, au DDO wa department husika kwa dataset yenye department. Dataset lazima iwe ndani ya scope ya mtumiaji aliyeingia. Ina pagination (`perPage`, kiwango cha juu 100) na utafutaji kwa jina, email au username (`search`).

### Chagua mwaka na frequency

`POST {{baseUrl}}/datasets/{datasetId}/reporting-years`

```json
{"startYear": 2027, "frequency": "quarterly"}
```

Kwa settings za Julai, hii ni mwaka 2027/2028. Dataset lazima iwe active, frequency iwe katika master na settings ziwepo. Server inareuse au kuunda mwaka na periods zake, na calendars zinazokosekana. Inarudisha `data` array yenye reportingPeriodId, label, periodType, periodNumber, startDate, endDate, isOpen na calendar. Closed annual hukataliwa; closed children zinaonyeshwa isOpen false na hazifunguliwi. Annual hurudisha period moja, monthly 12, quarterly 4, semiannual 2, weekly 53, daily 365/366.

Dataset-scoped IDO/DDO wanaweza kutumia njia hii bila kupewa ruhusa ya kusimamia periods zote. POST ni muhimu kwa sababu selection hii inaweza kuunda records. Kurudia hakurudii periods/calendars wala kubadilisha zilizopo. Institutions na scopes nyingine haziruhusiwi.

### Chagua kipindi na upate form ya submission

`POST {{baseUrl}}/datasets/{datasetId}/submission-context`

```json
{"startYear": 2027, "frequency": "quarterly", "periodNumber": 2}
```

Kwa monthly tumia periodNumber 1–12 kuanzia mwanzo wa reporting year. Kwa annual omit periodNumber. Response ina datasetId, reportingPeriod, calendar, templateVersionId, template, submittedAt na targets (array tupu kama hazipo). Hii ni preparation ya form; haihifadhi actual values wala kuanzisha approval workflow.

Selection ya kwanza hufunga template version kwenye calendar ya dataset+period; kurudia kunareuse version hiyo hata master iki-reactivate. Targets zilizopo za kipindi zikiwa na version moja, hiyo ndiyo inatumika; versions tofauti zinahitaji kuhakikiwa kwanza. Legacy calendar yenye submittedAt lakini haina template version hukataliwa badala ya kubuni version ya historia. Hakuna actual Submission model/controller kwenye repo kwa sasa; submit/review statuses na actual values ni integration inayofuata.

### Targets na reminders

- Targets zinaendelea kutumia endpoints zilizopo; hakuna target inayohitajika ili kuactivate master au kupata context. targetValue null haikubaliki ukitengeneza record.
- Kwa active dataset unaweza kuacha templateVersionId: server hutumia version iliyofungwa kwa kipindi, au latest version ikiwa kipindi bado hakijachaguliwa. Explicit version lazima ilingane na pinned calendar ikiwa ipo.
- Calendar si prerequisite tena ya target. Period lazima iwe open, ya taasisi hiyo na frequency/indicator/dimensions ziwe valid kwa version.
- Legacy draft targets hazibindwi automatically wakati wa activation. PATCH target baada ya activation huihakiki na kuiunganisha na version; historia yenye version iliyopo haihamishwi.
- `datasets:send-reminders` sasa huandaa calendars za mwaka wa sasa na unaofuata kwa active masters zenye remindersEnabled kabla ya kutuma reminders. Scheduler bado hourly. Settings zisizowekwa hazikadiriwi kutoka calendars za zamani.
- Hakuna kurudia notifications zilizopitwa na tarehe. Kabla actual submission haijaunganishwa, submittedAt haijazwi na endpoint ya context.

Migration mpya: `2026_10_21_115518_add_recurring_reporting_to_datasets` inaongeza nullable reporting_settings na calendar template_version_id; haifuti data zilizopo.

## Endpoints za manual administration na mifano ya awali

Endpoints za chini zinaendelea kufanya kazi kwa kusimamia periods/targets manually; flow ya master hapo juu ndiyo inayotumika sasa.

Base URL ya mfano: `http://192.168.18.2:8000/api/v1`.
Requests zote zinahitaji Bearer token, `Accept: application/json` na `Content-Type: application/json` kwa body.
IDs zote hapa ni mifano; tumia IDs za responses halisi.

## Ruhusa na maana ya periods

- MOA husimamia periods zote. Ruhusa iliyopo ya `submission_periods.configure` hutumika kwa kuunda, kurekebisha deadline, kufunga na kufungua period; IA hupata scope ya taasisi yake.
- IDO/DDO wenye `submission_periods.view` husoma periods za taasisi yao.
- Targets hutumia scope ya dataset: MOA zote, IA/IDO taasisi yao, DDO department yake. Hizi ni targets za dataset, si records binafsi za creator pekee.
- Periods zinasaidia `annual`, `quarterly`, `monthly`, `semiannual`, `weekly` na `daily`. Weekly ni vipande vya siku saba kuanzia reporting year, si ISO week.
- Annual ni miezi 12 kuanzia siku ya kwanza ya mwezi. Calendar lazima ianze Januari 1; financial inaweza kuanza mwezi uliowekwa na taasisi.
- Q1–Q4 hutokana na annual parent. Kwa July–June, Q1 ni July–September, Q2 October–December, Q3 January–March, Q4 April–June.
- Deadline ni tarehe (inclusive, katika timezone ya application); haiwezi kuwa kabla ya mwisho wa kipindi.
- `open` hapa inaruhusu kuandaa/kurekebisha targets, hata kabla kipindi kuanza au baada ya deadline. Deadline imehifadhiwa kwa submission validation itakayofuata; kupita deadline hakufungi period automatically.
- Kufunga annual kunafanya quarters zake zisiwe effectively open. `isOpen` ya response inaonyesha hili hata kama quarter status yake bado ni open.

## 1. Unda annual ya TANTRADE (MOA/IA)

Taasisi ya mfano ni ID 4. Hakikisha institution ni active.

```http
POST http://192.168.18.2:8000/api/v1/reporting-periods
```

```json
{
  "institutionId": 4,
  "periodType": "annual",
  "yearType": "financial",
  "startDate": "2026-07-01",
  "endDate": "2027-06-30",
  "deadline": "2027-07-31"
}
```

Expected `201 Created`; hifadhi `data.id` kama annual ID, mfano 50.
Code inazalishwa `FY-2026-07-ANNUAL`, label `2026/2027`, status open.
Kwa calendar badilisha yearType kuwa calendar na dates kuwa `2026-01-01` hadi `2026-12-31`.
Mwaka mwingine wa aina hiyo hiyo ndani ya taasisi hauwezi kuwa na dates zinazoingiliana.

## 2. Unda quarters

Endpoint ileile; dates na yearType hazitumwi kwa quarter, zinatokana na parent.

```http
POST http://192.168.18.2:8000/api/v1/reporting-periods
```

```json
{
  "institutionId": 4,
  "periodType": "quarterly",
  "parentId": 50,
  "quarter": 1,
  "deadline": "2026-10-31"
}
```

Expected `201`, mfano ID 51; startDate `2026-07-01`, endDate `2026-09-30`, code `FY-2026-07-Q1`.
Quarter ileile hairudiwi kwenye annual parent. Q2–Q4 zitumwe kama requests tofauti kwenye endpoint hiyo hiyo:

```json
{"institutionId":4,"periodType":"quarterly","parentId":50,"quarter":2,"deadline":"2027-01-31"}
```

```json
{"institutionId":4,"periodType":"quarterly","parentId":50,"quarter":3,"deadline":"2027-04-30"}
```

```json
{"institutionId":4,"periodType":"quarterly","parentId":50,"quarter":4,"deadline":"2027-07-31"}
```

## 3. Soma, rekebisha deadline, funga au fungua

```http
GET http://192.168.18.2:8000/api/v1/reporting-periods?institutionId=4&perPage=100
GET http://192.168.18.2:8000/api/v1/reporting-periods?parentId=50&periodType=quarterly
GET http://192.168.18.2:8000/api/v1/reporting-periods/51
```

Deadline update:

```http
PATCH http://192.168.18.2:8000/api/v1/reporting-periods/51
```

```json
{"deadline":"2026-11-15"}
```

Close: PATCH endpoint hiyo hiyo na `{"status":"closed"}`, au:

```http
DELETE http://192.168.18.2:8000/api/v1/reporting-periods/51
```

DELETE haina body na haifuti records. Reopen:

```http
PATCH http://192.168.18.2:8000/api/v1/reporting-periods/51
```

```json
{"status":"open"}
```

Mwaka parent ukiwa closed, ufungue kwanza. Institution, periodType, yearType, parent, quarter na start/end dates
hazibadilishwi baada ya kuunda. Hii inazuia kuhamisha maana ya targets zilizohifadhiwa.

## 4. Annual target ya dataset active

Kabla ya targets, fuata [dataset configuration](dataset-configuration.md) na activate dataset.
Mfano: dataset 5, template version record ID 41, indicator permits ID 21, integer.
Version ID si version_number. Indicator lazima iwe ndani ya snapshot ya version hiyo na frequency ya period iruhusiwe humo.
Period lazima iwe ya taasisi inayomiliki dataset na effectively open.

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/targets
```

```json
{
  "indicatorId": 21,
  "reportingPeriodId": 50,
  "templateVersionId": 41,
  "targetScope": "total",
  "targetValue": "400",
  "notes": "Annual permits target for 2026/2027."
}
```

Expected `201 Created`. `targetValue` ni JSON **string**, ili fedha zisipoteze precision.
Response huiweka na decimal places 6, mfano `"400.000000"`; indicator integer hairuhusu input `"400.5"`.

## 5. Quarterly target ya indicator hiyo hiyo

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/targets
```

```json
{
  "indicatorId": 21,
  "reportingPeriodId": 51,
  "templateVersionId": 41,
  "targetScope": "total",
  "targetValue": "100",
  "notes": "Q1 permits target."
}
```

Annual 400 na Q1 100 ni targets tofauti. Mfumo hauzalishi quarters kutoka annual wala kulazimisha
annual iwe jumla ya quarters: kanuni hiyo hutegemea indicator. Usijumlishe annual na quarterly targets pamoja kwenye analytics.

## 6. Target iliyogawanywa kwa dimension

Mfano dimension REGION ID 31 na reference value DAR ID 120 vipo kwenye template snapshot 41.

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/targets
```

```json
{
  "indicatorId": 21,
  "reportingPeriodId": 51,
  "templateVersionId": 41,
  "targetScope": "dimensions",
  "dimensionValues": [
    {"dimensionId": 31, "value": 120}
  ],
  "targetValue": "25",
  "notes": "Q1 permits target for Dar es Salaam."
}
```

- `total` haitumi dimensionValues; ni jumla ya dataset/indicator/period hata kama template ina required dimensions.
- `dimensions` inahitaji angalau dimension moja na dimensions zote required za snapshot.
- Reference value ni ID iliyo kwenye snapshot, si label. Reference value iliyoletwa baadaye inahitaji template version mpya.
- Text hutumia string, boolean true/false, date `YYYY-MM-DD`; numeric dimensions hutumia string au integer.
- Mpangilio tofauti wa dimensions au reference ID kama string badala ya integer hautengenezi target mpya ya duplicate.
- Total na breakdown ni scope tofauti; reports hazipaswi kuzijumlisha pamoja na kuhesabu mara mbili.

## 7. Target ya fedha

Mfano indicator sales ID 22 ni decimal na unit TZS ndani ya snapshot.

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/targets
```

```json
{
  "indicatorId": 22,
  "reportingPeriodId": 51,
  "templateVersionId": 41,
  "targetScope": "total",
  "targetValue": "1500000.50",
  "notes": "Q1 sales target in TZS."
}
```

Unit haitumwi tena: inatokana na indicator snapshot. Numeric input inaruhusu hadi digits 18 kabla ya decimal na 6 baada yake;
scientific notation, commas, NaN/Infinity hazikubaliki. Namba hasi zinaruhusiwa kwa indicators zinazoweza kuwa negative;
min/max rules maalumu za kila indicator bado hazijaongezwa. Targets za text/boolean/date hazijatekelezwa.

## 8. Soma na rekebisha target

Hifadhi ID ya target kutoka `data.id`, mfano 70.

```http
GET http://192.168.18.2:8000/api/v1/datasets/5/targets?reportingPeriodId=51&status=active
GET http://192.168.18.2:8000/api/v1/datasets/5/targets?indicatorId=21&targetScope=total
GET http://192.168.18.2:8000/api/v1/datasets/5/targets/70
PATCH http://192.168.18.2:8000/api/v1/datasets/5/targets/70
```

Body ya PATCH:

```json
{"targetValue":"120","notes":"Revised Q1 target."}
```

PATCH inaruhusu targetValue, notes (ikiwemo null) na status active/inactive.
Indicator/period/templateVersion/scope/dimensions ni identity; havihamishwi kwa PATCH.
Duplicate identity hurudisha 409 hata version mpya ikitajwa; badilisha record iliyopo kwa PATCH.
Kuhamisha target identity/version yenye historia hakujatekelezwa; hakuna endpoint ya kufuta historia au target revision workflow.
Target ya version ya zamani hubaki nayo hata dataset ikipata V2.

```http
DELETE http://192.168.18.2:8000/api/v1/datasets/5/targets/70
```

DELETE huweka inactive. Kuirudisha, PATCH endpoint hiyo hiyo:

```json
{"status":"active"}
```

Targets mpya zinaweza kuandaliwa kwenye draft bila templateVersionId, au kwenye dataset active kwa version iliyopo. Period/parent lazima iwe open na calendar iwepo; kusitisha target ya draft iliyopitwa na period kunaruhusiwa. Read endpoints zinaonyesha historia hata baada ya kufungwa. Angalia mtiririko wa wizard mwisho wa document.

## Audit, validation na mipaka

Period creation/update/close/reopen na target creation/update/inactive zote zina audit ndani ya transaction.
Audit failure hurudisha mabadiliko nyuma. Scope isiyofikiwa hurudisha 404; permissions 403; duplicates 409; validation 422.

Kilichotekelezwa hapa ni periods na planned targets. Actual observations, submission deadlines enforcement,
approval ya targets/submissions, formula ya performance, dashboard aggregation na exports bado hazijatekelezwa.
Hakuna automatic notification/email/SMS iliyoongezwa.

## Dataset planning: source, consumers na calendar

Request za create/PATCH dataset zinapokea fields hizi pamoja na fields za kawaida:

```json
{
  "collectionMethod": "hybrid",
  "sourceSystemName": "Trade registry",
  "sourceDescription": "Taarifa za mfumo pamoja na taarifa za waratibu.",
  "consumers": [
    {"name": "National Bureau of Statistics", "shortName": "NBS"},
    {"consumerId": 2}
  ]
}
```

- `manual`, `system`, `hybrid` ndizo collection methods; system/hybrid zinahitaji sourceSystemName.
- Consumer aliyepo huchaguliwa kwa consumerId pekee. Jina husawazishwa kwa case na spaces ili kuzuia duplicates; record ya pamoja haibadilishwi na uchaguzi wa dataset.
- Omit consumers kwenye PATCH kuhifadhi waliopo; `consumers: []` kuondoa links zote kwenye draft.
- `GET /api/v1/data-consumers?search=statistics` hutafuta catalogue.
- Source/consumers huwekwa kwenye template snapshot wakati wa activation. Dataset active lazima irudishwe draft kabla ya kuhariri configuration.

### Quarters na automatic deadlines

Wakati wa kuunda reporting period, tumia `deadlineDays: 15` badala ya `deadline`; usitume zote. Hizi ni siku za kalenda baada ya mwisho wa period. Siku 15 ni mfano wa testing, si policy rasmi.

`POST /api/v1/reporting-periods/{annualId}/quarters`

```json
{"deadlineDays": 15}
```

Huzalisha Q1–Q4. Kurudia request hurudisha periods zilizopo bila kuandika upya deadlines zake.

`PUT /api/v1/datasets/{datasetId}/reporting-calendar`

```json
{
  "reportingPeriodId": 2,
  "responsibleUserId": 12,
  "deadlineDays": 15,
  "reminderDays": [7, 1],
  "remindersEnabled": false
}
```

`GET /api/v1/datasets/{datasetId}/reporting-calendar` husoma calendars. Dataset+period ni unique. Calendar deadline huhifadhiwa tofauti na default ya period; kubadili period deadline hakuandiki upya calendar. Mpokeaji lazima awe IDO wa taasisi au DDO wa department husika.

### Kutengeneza miezi yote ya mwaka

`POST /api/v1/reporting-periods/{annualId}/months`

```json
{"deadlineDays": 0}
```

Hutengeneza monthly periods zote 12 chini ya annual period open, kuanzia mwezi wa mwanzo wa mwaka huo. Kwa WMA mwaka 2026/2027 wenye ID 22, tumia `/api/v1/reporting-periods/22/months`. Response ni HTTP 200 yenye `data` array kwa mpangilio M1–M12. Miezi iliyopo (kama M1 ID 32) hurudishwa bila kubadilisha IDs, deadlines au status; miezi inayokosekana pekee huundwa. Audit failure hurudisha transaction yote nyuma. Endpoint hii haitengenezi dataset calendars; tumia IDs zilizorudishwa kwenye bulk assignment inayofuata.

### Generators za frequencies zote

Generators zingine zinatumia body ileile `{"deadlineDays": 0}` na annual ID iliyo open:

| Endpoint (POST) | Vipindi vinavyorudishwa |
| --- | --- |
| `/api/v1/reporting-periods/{annualId}/quarters` | Q1–Q4 |
| `/api/v1/reporting-periods/{annualId}/months` | M1–M12 |
| `/api/v1/reporting-periods/{annualId}/semiannual` | H1–H2, kila moja miezi sita |
| `/api/v1/reporting-periods/{annualId}/weeks` | Wiki 53 kutoka siku ya kwanza ya mwaka; wiki ya mwisho inaweza kuwa fupi |
| `/api/v1/reporting-periods/{annualId}/days` | Siku 365 au 366 kulingana na mwaka |

Zote zinahifadhi periods zilizopo bila kuandika upya deadline/status, zinahitaji ruhusa za kuconfigure periods za taasisi hiyo, na zinahifadhi audit ndani ya transaction moja. Annual yenyewe huundwa kwa POST `/api/v1/reporting-periods`; hakuna annual child generator. Dates huhesabiwa kutoka startDate ya annual, si mwaka wa kalenda kwa lazima. Generation haifanyi assignment kwenye dataset.

### Kuassign periods nyingi kwa request moja

Endpoint ileile ya `PUT /api/v1/datasets/{datasetId}/reporting-calendar` inakubali bulk assignment:

```json
{
  "reportingPeriodIds": [7, 8, 9, 10],
  "responsibleUserId": 7,
  "deadlineDays": 0,
  "reminderDays": [10],
  "remindersEnabled": true
}
```

IDs ni mifano: chagua periods za taasisi ya dataset. `deadlineDays: 0` huweka deadline sawa na mwisho wa kila period; reminder hutokea siku 10 kabla. Hii inafanya kazi kwa quarterly, monthly au frequency nyingine iliyoruhusiwa kwenye dataset. Haitengenezi reporting periods mpya.

- Tuma `reportingPeriodId` moja **au** `reportingPeriodIds`, si zote (hata nyingine ikiwa null).
- Bulk inahitaji list yenye IDs 1–366, bila duplicates. Periods lazima ziwe open pamoja na annual parent, ziwe za taasisi hiyo na frequency inayoruhusiwa. Officer lazima awe active IDO/DDO anayehusika.
- Bulk hurudisha HTTP 200 yenye `data: [{...calendar...}, {...calendar...}]` kwa mpangilio wa IDs zilizotumwa. Single request inaendelea kurudisha `data: {...calendar...}`.
- Calendar iliyopo husasishwa bila duplication; isiyopo huundwa. Calendars ambazo hazijachaguliwa hazibadilishwi. Kurudia payload ileile hakuongezi audit zisizo na mabadiliko.
- Calendar iliyokwisha submitiwa hukataa request yote. Validation ya period yoyote au audit ikishindwa, calendar writes na audit za bulk yote zinarudishwa nyuma.
- Settings ni za pamoja kwa periods zote zilizochaguliwa. Officer/reminders tofauti kwa kipindi kimoja vinaweza kurekebishwa kwa single request.
- Defaults za awali zinabaki: ukiacha `reminderDays` hutumika `[7, 1]`; ukiacha `remindersEnabled` hutumika `false`, hata kwenye update. Tuma settings unazotaka kuhifadhi.
- Hakuna migration inayohitajika; kila dataset+period inaendelea kuwa record tofauti.

### Reminders na integration inayofuata

`php artisan datasets:send-reminders` hutuma in-app notifications pekee. Scheduler imepangwa hourly; mazingira ya server yanahitaji `php artisan schedule:run` kila dakika, au `php artisan schedule:work` kwenye development. Email/SMS hazitumiki hapa.

Reminders ni opt-in (`remindersEnabled` default false); sample zimezimwa. Haziendi kwa dataset draft/inactive, period iliyofungwa, officer asiye active, au calendar yenye submitted_at. Siku huhesabiwa kwa Africa/Dar_es_Salaam. Reminder hutumwa kwenye siku iliyoratibiwa pekee; hakuna catch-up ya siku zilizopita. Unique delivery key na transaction huzuia duplication na audit isiyo na notification.

Module ya Submission bado haijaunganishwa: itapaswa kuita `DatasetCalendarService::markSubmitted(datasetId, periodId)` ndani ya submission transaction. Hadi hapo usiwashe reminders kwa kazi halisi ambayo submission yake inafanyika nje ya mfumo huu.

### Priority ya MDO

`PATCH /api/v1/datasets/{datasetId}/priority`

```json
{"priority": "high", "reason": "Maelekezo mapya ya kisera kuhusu biashara ya nje."}
```

MDO pekee; department dataset inahitaji MDO wa department hiyo. Request hii inarudisha 422 kabla ya priority ya review ya kwanza kuwekwa. Workflow itaita `DatasetPriorityService::duringReview(...)` baada ya kuhakiki stage/assignment ya submission; hakuna client flag ya kuruka review. Baadaye PATCH hubadili priority kwa sababu na audit. Priority ya sasa haibadilishi template snapshots; submission approval itahitaji snapshot ya priority wakati module yake inapoandaliwa.

### Sample ya testing

`php artisan db:seed --class=TantradePlanningSeeder`

Seeder ni development/testing pekee, inarudiwa bila duplicates, na haitumwi na DatabaseSeeder automatically. Dataset `[TEST] TANTRADE Market Access Planning` ina source manual, NBS consumer, sector TRADE, indicator integer yenye unit NUMBER, annual 2026/2027 na quarters/calendars. Dimension na activation vinaachwa kwa testing ya Postman; priority ni null. Kanuni ya siku 15 ni sample.

TANTRADE ikiwa inactive, sample hutumia taasisi tofauti `TANTRADE_DEMO` bila kuifungua TANTRADE. Officer wa sample hupata password random; admin anaweza kusimamia activation yake. Hakuna password ya user aliyepo inayobadilishwa.

## Mtiririko wa master kabla na baada ya activation

1. Unda dataset draft na details zake.
2. Ongeza indicators na dimensions zinazohusika.
3. GET `/api/v1/datasets/{datasetId}/configuration-progress` kuhakiki `datasetDetails` na `indicatorsAndDimensions`.
4. POST activate: version ya master hutengenezwa na dataset huwa active ndani ya transaction moja pamoja na audit. Hakuna mwaka wala target inayolazimishwa.
5. Weka reporting-settings mara moja, kisha chagua startYear/frequency kupitia reporting-years au submission-context.
6. Weka optional targets za mwaka/kipindi; dataset haihitaji kueditwa au kureactivate kwa sababu mwaka umebadilika.

Mfano wa draft target (IDs ni mifano):

```json
{
  "indicatorId": 6,
  "reportingPeriodId": 2,
  "targetValue": "20",
  "targetScope": "dimensions",
  "dimensionValues": [{"dimensionId": 1, "value": 1}],
  "notes": "Mpango wa Incoming Q1"
}
```

Legacy target ya draft ina `phase: draft` na `templateVersionId: null`; activation haibadili record hiyo. PATCH ya target baada ya activation huihakiki kabla ya kuipa version. Target mpya ya active master huwa versioned moja kwa moja. Target ya draft iliyopitwa na configuration/period inaweza kuwekwa inactive.

Activation haihitaji calendar. Calendars za periods closed au zilizowasilishwa hubaki historia, lakini hazimo kwenye snapshot mpya ya master. Progress haisave version wala kubadili data.

Dataset active inaweza kuweka targets kwa explicit templateVersionId au kuacha server ichague version. Calendar si prerequisite. Kurudisha dataset draft hakufuti version/targets za zamani wala kuzihamisha: target iliyokwisha version haihaririwi wakati dataset ni draft. Identity ya target (dataset+indicator+period+dimensions) hubaki unique; kwa mwaka mpya tumia periods mpya.

Submission-context inaandaa mwaka, kipindi na form version. Kuhifadhi actual values na kuzipeleka kwenye review workflow bado ni module inayofuata.
