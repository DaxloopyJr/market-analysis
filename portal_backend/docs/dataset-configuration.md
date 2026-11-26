# Dataset configuration API

Mwongozo wa kujaribu hatua kwa hatua upo kwenye [Lifecycle ya TANTRADE](#lifecycle-ya-tantrade-hatua-kwa-hatua).
Hali ya utekelezaji na kazi inayofuata ipo kwenye [Kilichobaki](#kilichobaki).

Requests hutumia Bearer token na `Accept: application/json`. Base path ni `/api/v1`.
MOA husimamia datasets zote; IA/IDO husimamia za taasisi yao na DDO za department yake.
Indicator/dimension definitions huhaririwa na creator au MOA. Muundo unaotumiwa na dataset active haulazimishwi kubadilika.

Dimensions zenye options zinazoandikwa moja kwa moja na indicator scope zimeelezwa kwenye [manual-dimensions.md](manual-dimensions.md).

## 1. Sectors na subsectors

Reference type ya sectors lazima iwe na code `SECTOR`. Sector ni root value (`parent_id = null`).
Subsector ni mtoto wa moja kwa moja wa sector; inaweza kuwa chini ya type `SECTOR` au `SUBSECTOR`.
Records na reference types lazima ziwe active na ndani ya effective dates.
IDs hapa ni mifano; tumia IDs zilizopo kwenye database.

Sectors hutumwa kwenye `POST /datasets` wakati wa creation. `GET /datasets/5/sectors` huisoma; endpoint ya PUT imeondolewa.

```json
{
  "sectors": [
    {"sectorId": 2, "subsectorIds": [7, 8]},
    {"sectorId": 3, "subsectorIds": []}
  ]
}
```

Dataset inaweza kuwa na sectors nyingi. Angalau sector moja inahitajika wakati wa creation; sectors hazibadilishwi baadaye.

## 2. Dimensions

Dimension hueleza mgawanyo wa values, mfano region, gender au enterprise size.
Inatofautiana na sector ya dataset: classification ya dataset si lazima iwe field inayojazwa kila observation.

`POST /datasets/5/dimensions` huunda definition na kuiunganisha ndani ya transaction moja:

```json
{
  "dimension": {
    "dimensionCode": "REGION",
    "nameEn": "Region",
    "nameSw": "Mkoa",
    "dataType": "reference",
    "referenceTypeId": 4
  },
  "isRequired": true,
  "displayOrder": 1
}
```

`referenceTypeId` ya mfano 4 lazima iwe reference type iliyo active na yenye values halali.
Data types: `reference`, `text`, `integer`, `decimal`, `boolean`, `date`.
Data types zisizo `reference` hazina `referenceTypeId`. Dimension code inawekwa na mtumiaji na hairuhusiwi kubadilishwa.

Kuunganisha definition iliyopo: `{"dimensionId":1,"isRequired":true,"displayOrder":1}` kwenye endpoint hiyo hiyo.

| Method | Path | Kazi |
|---|---|---|
| GET | `/dimensions` | Catalogue yenye pagination na optional status filter |
| GET | `/dimensions/{id}` | Definition moja |
| PATCH | `/dimensions/{id}` | Jina, dataType, referenceTypeId au status; creator/MOA |
| DELETE | `/dimensions/{id}` | Inactive; definition haifutwi |
| GET | `/datasets/5/dimensions` | Dimensions zilizounganishwa |
| PATCH | `/datasets/5/dimensions/1` | `isRequired` na/au `displayOrder` pekee |
| DELETE | `/datasets/5/dimensions/1` | Ondoa uhusiano pekee |

Dimensions ni optional. Ikiwa zimewekwa, zote lazima ziwe active wakati wa activation.

## 3. Activation na template versions

`POST /datasets/5/activate` haina body. Dataset lazima iwe draft, iwe na:

- Institution/department halali na active.
- Jina na angalau frequency moja.
- Angalau sector moja, pamoja na hierarchy halali ya subsectors.
- Angalau indicator moja active yenye data type, unit na aggregation zinazokubaliana.
- Dimensions halali; reference dimensions ziwe na angalau reference value moja hai.

Activation hutengeneza V1, V2, n.k. automatically na kuweka dataset active katika transaction moja pamoja na audit.
Hifadhi `data.id` ya response kama template version ID. `template_content` ina snapshot ya jina,
frequencies, sectors/subsectors, indicator definitions na units, dimensions pamoja na reference values.
`effective_from` ni muda wa activation. API haitoi update/delete ya template versions.
Orodha na historia zinapatikana kupitia:

- `GET /datasets/5/template-versions`
- `GET /datasets/5/template-versions/{versionId}`

## 4. Kubadilisha configuration baada ya activation

1. `POST /datasets/5/draft` kurudisha dataset draft. Matoleo yaliyotolewa hubaki.
2. Hariri metadata, indicators au dimensions. Sectors hubaki kama zilivyochaguliwa wakati wa creation.
3. `POST /datasets/5/activate` kutoa version inayofuata.

Draft/inactive haitumiki kwa submissions mpya. Dataset iliyo active hutumia latest template version.
Kama indicator/dimension inashirikiwa na dataset nyingine active, definition hiyo haihaririwi;
unda definition nyingine kwa maana mpya na ubadilishe uhusiano wa draft husika.
`PATCH /datasets/5` hairuhusu status `active`; activation hutumia endpoint yake yenye validation.

## Uunganishaji wa submissions baadaye

Configuration endpoints huhifadhi muundo na snapshots; actual observation values bado hazipokelewi.
Submission itahitaji foreign key ya template version iliyotumika. Validation ya submission na reports
za zamani lazima zisome snapshot hiyo badala ya current catalogue. Hakuna submission model iliyoongezwa hapa.
Quarter/year na targets hushughulikiwa katika reporting periods/submissions, si frequency ya definition.

Reporting periods na planned targets sasa zina API zake: [mwongozo wa periods na targets](reporting-periods-and-targets.md).
Actual observation values na submissions bado hazijatekelezwa.

## Lifecycle ya TANTRADE: hatua kwa hatua

Mfano huu ni wa majaribio: **Market Access and Entry Information** ya TANTRADE.
Sector ni Trade, subsector ni Trade Promotion, indicator ni idadi ya vibali pamoja na thamani ya mauzo,
na dimension ni mkoa. Huu si uthibitisho wa classification rasmi ya TANTRADE.

Mtiririko wa configuration:

```text
Reference data tayari
  â†’ Unda dataset (draft)
  â†’ Chagua sector/subsector
  â†’ Ongeza indicators na units
  â†’ Ongeza dimensions zinazohitajika
  â†’ Activate: snapshot V1 + status active
  â†’ Reopen draft: V1 inabaki
  â†’ Badilisha configuration
  â†’ Activate: snapshot V2 + status active
  â†’ Deactivate: status inactive, historia inabaki
```

Activation ya configuration si approval/publication ya data iliyowasilishwa.
IDO wa TANTRADE anaweza kuandaa na kuactivate dataset iliyo ndani ya scope yake.
Workflow ya IDO â†’ IHOD â†’ AO â†’ MDO â†’ MDD itatumika kwenye submissions baadaye.

### Hatua 0: Postman na IDs

Host ya mfano ni `http://192.168.18.2:8000`; badilisha kama server address imebadilika.
Requests zenye body zitumie **Body â†’ raw â†’ JSON**. Headers:

```http
Accept: application/json
Content-Type: application/json
Authorization: Bearer <token-ya-user>
```

`GET`, `DELETE`, activation na draft requests hazihitaji body. Usitume headers hizi kama JSON ya body.

Login endpoint (tumia credentials halali za account iliyopo):

```http
POST http://192.168.18.2:8000/api/v1/login
```

```json
{
  "email": "ido@example.test",
  "password": "WEKA_PASSWORD_YA_ACCOUNT",
  "device": "Postman"
}
```

Email/password hapo ni placeholders, si account iliyoseed. Login haihitaji Bearer token.
Chukua `data.token` kwenye response, uiweke Authorization â†’ Bearer Token.

```http
GET http://192.168.18.2:8000/api/v1/me
```

Hakikisha account ni active, ina role IDO na institution ya TANTRADE. MOA anaweza kufanya hatua hizi ndani ya scope zote.
Kuunda reference data kunahitaji `reference_data.manage` (kwa kawaida MOA/IA); tumia token hiyo kwa Hatua 1,
kisha token ya IDO wa TANTRADE kwa dataset configuration.

IDs zifuatazo ni **mifano tu**, si matokeo yaliyosomwa kutoka database. Baada ya kila POST tumia ID halisi ya response:

| Record | ID ya mfano | Inachukuliwa wapi |
|---|---|---|
| Institution TANTRADE | 4 | Account/institution iliyopo; lazima iwe active |
| Reference type SECTOR | 10 | `data.id` ya kuunda type |
| Reference type UNIT | 11 | `data.id` ya kuunda type |
| Reference type REGION | 12 | `data.id` ya kuunda type |
| Trade / Trade Promotion | 100 / 101 | `data.id` ya kuunda reference value |
| Units NUMBER / TZS | 110 / 111 | `data.id` ya kuunda reference value |
| Region Dar es Salaam | 120 | `data.id` ya kuunda reference value |
| Dataset | 5 | `data.id` ya kuunda dataset |
| Indicators permits / sales | 21 / 22 | **`data.indicatorId`** ya nested POST |
| Dimension region | 31 | **`data.dimensionId`** ya nested POST |
| Template V1 / V2 | 41 / 42 | `data.id` ya activation |

Nested response `data.id` ni ID ya uhusiano; si lazima iwe sawa na indicatorId/dimensionId.
Usirudie kuunda reference types/codes zilizopo: soma orodha na tumia IDs zake. Pagination ipo; pitia pages zinazohitajika.

### Hatua 1: Andaa reference data (MOA/IA)

Angalia zilizopo kwanza:

```http
GET http://192.168.18.2:8000/api/v1/reference-data?perPage=100
```

Kwa type ambayo haipo, tuma kila JSON hapa chini kama request tofauti kwenda:

```http
POST http://192.168.18.2:8000/api/v1/reference-data
```

SECTOR (mfano response `data.id = 10`):

```json
{"dataTypeCode":"SECTOR","dataTypeNameEn":"Sector","dataTypeNameSw":"Sekta","status":"active"}
```

UNIT (mfano `11`):

```json
{"dataTypeCode":"UNIT","dataTypeNameEn":"Unit","dataTypeNameSw":"Kipimo","status":"active"}
```

REGION (mfano `12`):

```json
{"dataTypeCode":"REGION","dataTypeNameEn":"Region","dataTypeNameSw":"Mkoa","status":"active"}
```

Unda Trade, root sector (mfano value ID `100`):

```http
POST http://192.168.18.2:8000/api/v1/reference-data/10/values
```

```json
{"dataValueCode":"TRADE","dataValueNameEn":"Trade","dataValueNameSw":"Biashara","parentId":null,"status":"active"}
```

Unda Trade Promotion chini yake (mfano value ID `101`):

```http
POST http://192.168.18.2:8000/api/v1/reference-data/10/values
```

```json
{"dataValueCode":"TRADE_PROMOTION","dataValueNameEn":"Trade Promotion","dataValueNameSw":"Ukuzaji wa biashara","parentId":100,"status":"active"}
```

Unda NUMBER (mfano value ID `110`) na TZS (mfano `111`), kila JSON request tofauti:

```http
POST http://192.168.18.2:8000/api/v1/reference-data/11/values
```

```json
{"dataValueCode":"NUMBER","dataValueNameEn":"Number","dataValueNameSw":"Idadi","value":"count","status":"active"}
```

```json
{"dataValueCode":"TZS","dataValueNameEn":"Tanzanian shilling","dataValueNameSw":"Shilingi ya Tanzania","value":"TZS","status":"active"}
```

Unda mkoa (mfano value ID `120`):

```http
POST http://192.168.18.2:8000/api/v1/reference-data/12/values
```

```json
{"dataValueCode":"DAR","dataValueNameEn":"Dar es Salaam","dataValueNameSw":"Dar es Salaam","status":"active"}
```

Hakikisha values kwa:

```http
GET http://192.168.18.2:8000/api/v1/reference-data/10/values
GET http://192.168.18.2:8000/api/v1/reference-data/11/values
GET http://192.168.18.2:8000/api/v1/reference-data/12/values
```

### Hatua 2: Unda dataset draft (IDO wa TANTRADE)

```http
POST http://192.168.18.2:8000/api/v1/datasets
```

```json
{
  "institutionId": 4,
  "departmentId": null,
  "datasetName": "Market Access and Entry Information",
  "description": "Trade promotion activities supporting access of Tanzanian products to local, regional and international markets.",
  "frequencies": ["monthly", "quarterly", "annual"], "sectors": [{"sectorId":100,"subsectorIds":[101]}]
}
```

Expected: `201 Created`, `data.status = draft`. Hifadhi `data.id` (mfano `5`).
`datasetCode` hutengenezwa na backend, mfano `TANTRADE/2026/0001`; mwaka hutokana na tarehe ya server.
Usitume datasetCode/createdBy. Frequencies ni array ya lowercase, si `"Quarterly"`.
Kwa TANTRADE departmentId ni null; DDO wa wizara hutumia department yake na institution ya MIT.

```http
GET http://192.168.18.2:8000/api/v1/datasets/5
GET http://192.168.18.2:8000/api/v1/datasets?status=draft&perPage=20
```

### Hatua 3: Hakiki sectors zilizohifadhiwa wakati wa creation

GET http://192.168.18.2:8000/api/v1/datasets/5/sectors

Expected: 200 OK. Sectors huchaguliwa kwenye POST ya dataset; hakuna PUT ya kuzibadili.

### Hatua 4: Unda indicators ndani ya dataset

Indicator ya idadi ya vibali (mfano indicator ID `21`):

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/indicators
```

```json
{
  "indicator": {
    "nameEn": "Number of trade promotion permits issued",
    "nameSw": "Idadi ya vibali vya ukuzaji wa biashara vilivyotolewa",
    "descriptionEn": "Permits issued during the reporting period.",
    "dataType": "integer",
    "unitId": 110,
    "aggregationRule": "sum"
  },
  "isRequired": true,
  "displayOrder": 1
}
```

Expected: `201 Created`. Code mfano `TANTRADE/IND/2026/0001` huzalishwa automatically.
Chukua `data.indicatorId`; `data.id` ni link ID. Usitume indicatorCode.

Indicator ya fedha (mfano indicator ID `22`), endpoint hiyo hiyo:

```json
{
  "indicator": {
    "nameEn": "Value of sales facilitated",
    "nameSw": "Thamani ya mauzo yaliyowezeshwa",
    "dataType": "decimal",
    "unitId": 111,
    "aggregationRule": "sum"
  },
  "isRequired": true,
  "displayOrder": 2
}
```

`sum` katika mfano huu hudhani values za matukio tofauti bila marudio; annual totals na quarterly totals
hazipaswi kujumlishwa pamoja baadaye. Aggregation rule ni configuration tu, bado si analytics calculator.

**Njia mbadala kwa indicator iliyopo:** badala ya object `indicator`, tuma JSON hii kwenye POST hiyo hiyo:

```json
{"indicatorId":1,"isRequired":true,"displayOrder":3}
```

Usitume indicatorId na indicator mpya pamoja. Kuunganisha hakubadilishi code ya zamani.
Indicator moja ikiunganishwa tena kwenye dataset hiyo hiyo, response ni `409`.

```http
GET http://192.168.18.2:8000/api/v1/datasets/5/indicators
GET http://192.168.18.2:8000/api/v1/indicators?status=active&perPage=100
```

Data types zinazopatikana ni integer, decimal, text, boolean, date. Text/boolean hukubali aggregation
none/latest; date hukubali none/min/max/latest. Numeric hukubali none/sum/average/min/max/latest.
Unit ikitajwa lazima iwe value hai ya UNIT. Asilimia hutumia decimal na unit husika; range/weighted percentage
rules bado hazijaongezwa. Numeric unit kwa sasa inaweza kuwa null, ingawa mfano huu unaweka units wazi.

### Hatua 5: Ongeza dimension ya mkoa

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/dimensions
```

```json
{
  "dimension": {
    "dimensionCode": "REGION",
    "nameEn": "Region",
    "nameSw": "Mkoa",
    "dataType": "reference",
    "referenceTypeId": 12
  },
  "isRequired": true,
  "displayOrder": 1
}
```

Expected: `201 Created`. Hifadhi `data.dimensionId` (mfano `31`). Reference dimension lazima iwe na values hai.
Dimension ya REGION ikiwa tayari ipo, usiiunde tena; tuma `{"dimensionId":31,"isRequired":true,"displayOrder":1}`.
Orodha ya definitions:

```http
GET http://192.168.18.2:8000/api/v1/dimensions?status=active
GET http://192.168.18.2:8000/api/v1/datasets/5/dimensions
```

Mfano wa baadaye wa record ya data ni: kipindi Q1, mkoa DAR, permits 25, sales TZS 1500000.
Values hizo **hazitumwi** kwenye configuration endpoints; ni za module ya submissions/observations itakayofuata.
Dimensions ni optional; kama data haihitaji kuvunjwa kwa mkoa/gender n.k. unaweza kuruka hatua hii.

### Hatua 6: Activate na kupata V1

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/activate
```

Body: **none**. Expected: `201 Created`; `data.version_number = 1`, `data.id` mfano `41`.
Response ya template version kwa sasa hutumia snake_case, mfano `template_content`, tofauti na payloads za configuration.
Huu si response kamili, bali fields za kukagua:

```json
{"data":{"id":41,"dataset_definition_id":5,"version_number":1,"template_format":"json"}}
```

Backend hukagua prerequisites zilizoorodheshwa juu, hutengeneza snapshot V1, huweka dataset active,
na kurecord `template_version_created` pamoja na `dataset_activated` ndani ya transaction moja.
Audit ikifeli, activation/version havihifadhiwi.

```http
GET http://192.168.18.2:8000/api/v1/datasets/5
GET http://192.168.18.2:8000/api/v1/datasets/5/template-versions
GET http://192.168.18.2:8000/api/v1/datasets/5/template-versions/41
```

Dataset response ina status active na latestTemplateVersionId. Version URL hutumia **version record ID 41**, si version_number 1.
Activation ya dataset ambayo tayari ni active hukataliwa `422`.

### Hatua 7: Marekebisho na V2

Rudisha draft kwanza (body none):

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/draft
```

Expected: `200 OK`, status draft. Hii haitengenezi version mpya yenyewe; V1 inabaki.
Kwa mpango wa submissions, dataset draft haitapokea submission mpya mpaka activation irudi.

Hariri maelezo:

```http
PATCH http://192.168.18.2:8000/api/v1/datasets/5
```

```json
{"description":"Trade promotion, facilitated sales and new markets reached.","frequencies":["quarterly","annual"]}
```

Ongeza indicator ya masoko mapya (mfano ID `23`):

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/indicators
```

```json
{"indicator":{"nameEn":"Number of new markets reached","dataType":"integer","unitId":110,"aggregationRule":"sum"},"isRequired":true,"displayOrder":3}
```

Badili required/order ya indicator ndani ya dataset pekee:

```http
PATCH http://192.168.18.2:8000/api/v1/datasets/5/indicators/23
```

```json
{"isRequired":false,"displayOrder":3}
```

Badili required/order ya dimension ndani ya dataset pekee:

```http
PATCH http://192.168.18.2:8000/api/v1/datasets/5/dimensions/31
```

```json
{"isRequired":true,"displayOrder":1}
```

Kuhariri definition yenyewe kunafanywa na creator/MOA; mabadiliko yataonekana katika drafts zote zinazotumia definition hiyo.
Definition iliyounganishwa na dataset yoyote active hairuhusiwi kuhaririwa. Kwa maana mpya,
unda indicator/dimension mpya badala ya kubadilisha definition inayoshirikiwa.

```http
PATCH http://192.168.18.2:8000/api/v1/indicators/23
```

```json
{"nameSw":"Idadi ya masoko mapya yaliyofikiwa"}
```

```http
PATCH http://192.168.18.2:8000/api/v1/dimensions/31
```

```json
{"nameSw":"Mkoa wa shughuli"}
```

Ukihitaji kuondoa link, endpoints hizi hazifuti definition, na hazitumiki kwa dataset active.
Hizi ni hatua za hiari, si lazima kwa mfano wa V2:

```http
DELETE http://192.168.18.2:8000/api/v1/datasets/5/indicators/23
DELETE http://192.168.18.2:8000/api/v1/datasets/5/dimensions/31
```

Activate tena baada ya marekebisho (body none):

```http
POST http://192.168.18.2:8000/api/v1/datasets/5/activate
```

Expected: `201 Created`, version_number 2, mfano version ID `42`.
V1 ina muundo wa zamani; V2 ina configuration iliyopo wakati wa activation ya pili.
Activation hutengeneza version inayofuata hata kama draft haikubadilishwa.

```http
GET http://192.168.18.2:8000/api/v1/datasets/5/template-versions/41
GET http://192.168.18.2:8000/api/v1/datasets/5/template-versions/42
```

Versions hazina endpoints za PATCH/DELETE. Hifadhi template version ID kwenye submission baadaye;
usitumie tu latestTemplateVersionId kusoma data ya zamani.

### Hatua 8: Kusitisha dataset na kuirudisha

```http
DELETE http://192.168.18.2:8000/api/v1/datasets/5
```

Body none. Expected: `200 OK`, status inactive. Dataset, links na versions hazifutwi.
Kurudia DELETE kwa dataset ambayo tayari ni inactive hakutengenezi mabadiliko mapya.

Ili kurudisha: `POST http://192.168.18.2:8000/api/v1/datasets/5/draft`, hakiki configuration,
kisha `POST http://192.168.18.2:8000/api/v1/datasets/5/activate`.
Hii hutengeneza version inayofuata; haiandiki upya V1/V2.

Kusitisha definition ya catalogue yenyewe (hiari; creator/MOA, ikiwa hakuna dataset active inayoitumia):

```http
DELETE http://192.168.18.2:8000/api/v1/indicators/23
DELETE http://192.168.18.2:8000/api/v1/dimensions/31
```

Definition inawekwa inactive; links haziondolewi moja kwa moja. Activation ya dataset yenye definition inactive hukataliwa.

### Hatua 9: Hakiki audit na errors

MOA mwenye ruhusa ya kusoma audit anaweza kutumia:

```http
GET http://192.168.18.2:8000/api/v1/audit-events
```

Audit events zinajumuisha dataset_created (pamoja na sectors), indicator_created,
dataset_indicator_attached/updated/detached, dimension_created/updated/deactivated,
dataset_dimension_attached/updated/detached, template_version_created,
dataset_activated, dataset_draft_opened na dataset_deactivated.
ID za mfano kwenye mwongozo hazikuundwa kwa kuandika dokumenti hii.

| Response | Maana inayotarajiwa |
|---|---|
| 401 | Token haipo au haikubaliki |
| 403 | Role/creator hana ruhusa au account si active |
| 404 | Record haipo au dataset iko nje ya institution/department scope |
| 409 | Indicator/dimension tayari imeunganishwa |
| 422 | Validation: wrong parent, reference inactive/expired, invalid aggregation, missing configuration, au dataset si draft |
| 500 | Backend failure; soma error/log. Si validation inayotarajiwa kwenye happy path |

## Kilichobaki

Configuration iliyotekelezwa: dataset CRUD/inactive, institution/department scope, auto codes, frequencies,
sector/subsector links, indicator catalogue/links, dimension catalogue/links, snapshots za versions,
activation validation na audit. Hakuna hatua ya lazima ya configuration iliyobaki katika vipengele vinne vilivyoombwa.

Hali ya modules zinazofuata configuration:

1. **Reporting periods â€” zimetekelezwa:** financial/calendar year, Q1â€“Q4, annual, dates, deadlines na close/reopen. Enforcement ya deadlines kwenye submissions bado inafuata.
2. **Indicator targets â€” zimetekelezwa:** numeric target kwa indicator, dataset, kipindi na dimensions za template snapshot. Angalia [endpoints na JSON](reporting-periods-and-targets.md).
3. **Submissions/observations:** actual values na dimension values, FK ya template version, validation ya integer/decimal/date/reference,
   required fields na duplicate observations. Configuration haijapokea values hizi bado.
4. **Workflow integration:** IDO â†’ IHOD â†’ AO â†’ MDO review â†’ MDD approval/publication; DDO â†’ MDO â†’ MDD.
   Dataset activation haitoi approval ya submission. Dependencies na compatibility za workflow bado zinahitaji kukamilishwa.
5. **Analytics/reporting:** kuunganisha models/schema ya sasa na dashboard/search, performance dhidi ya target,
   aggregation sahihi, reports na exports. Formula za sector performance, weighted percentages na double-counting rules bado hazipo.

Maboresho ya configuration yanayoweza kuongezwa kulingana na mahitaji: min/max na decimal precision,
range ya percentage, scheduled future versions, comparison ya V1/V2 na import/export ya templates.
Template immutability ya sasa inalindwa na model/API; direct database writes hazizuiliwi na trigger maalumu.
Usichukulie test za configuration kuwa uthibitisho kwamba modules za submissions na analytics zimekamilika.
