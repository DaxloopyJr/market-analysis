import json
from pathlib import Path
from collections import Counter
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "Viwanda_Portal_Backend_API_Reference.docx"
rows = []
def j(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2)
def add(module, method, path, access, desc, inp=None, response=None, query=None, rules="", codes=None):
    detail = []
    if query:
        detail.append("Query: " + query)
    if inp is not None:
        detail.append("Input:\n" + j(inp))
    elif method not in ("GET",):
        detail.append("Input: no request body.")
    if response is not None:
        detail.append("Response example (selected fields):\n" + j(response))
    if rules:
        detail.append("Rules: " + rules)
    status = codes or ("201 / 401 / 403 / 404 / 422" if method == "POST" else "200 / 401 / 403 / 404 / 422")
    headers = "Authorization: Bearer {token}\nAccept: application/json"
    if inp is not None:
        headers += "\nContent-Type: application/json"
    if access == "Public":
        headers = "Accept: application/json"
    rows.append(dict(module=module, method=method, path=path, access=access, desc=desc, detail="\n\n".join(detail), codes=status, headers=headers))

D = "MOA · IA · IDO · DDO\nDataset scope D"
C = "MOA · IA · IDO · DDO\nCatalogue scope C"
CW = C + "\nCreator or MOA to edit"
RR = "Active authenticated user"
RW = "reference_data.manage\nSeeded: MOA · IA"
PR = "MOA or submission_periods.view / configure\nPeriod scope P"
PW = "MOA or submission_periods.configure\nPeriod scope P"
page = lambda item: {"current_page": 1, "data": [item], "per_page": 20, "total": 1}
wrap = lambda item: {"data": item}
health = {"status":"success","application":"Viwanda Portal","message":"Laravel API is working"}
for path in ("/health", "/api/health"):
    add("Health", "GET", path, "Public", "Check API availability. /api/health is an absolute compatibility alias; /health uses the v1 base URL.", response=health, codes="200")

audit = {"id":1,"userId":1,"actorType":"user","eventType":"create_dataset","entityType":"dataset_definition","entityId":"6","requestId":None,"oldValues":None,"newValues":{},"reason":None}
add("Audit events","GET","/audit-events","audit.readAll gate\nRequires audit_logs.view.ministry","List immutable audit history.", response={"data":[audit],"links":{},"meta":{"current_page":1,"per_page":20,"total":1}},query="eventType, actorType, entityType, entityId, userId, requestId, startDate, endDate, perPage, page", rules="Dates: YYYY-MM-DD; endDate >= startDate. requestId: UUID. perPage 1–100; default 20. Response also includes ipAddress and createdAt.")
add("Audit events","GET","/audit-events/{id}","audit.readAll gate\nRequires audit_logs.view.ministry","Read one audit record.",response=wrap(audit),codes="200 / 401 / 403 / 404")
notif={"id":1,"auditEventId":12,"type":"DatasetReminder","message":"Dataset reporting reminder","isRead":False,"createdAt":"2026-09-20T09:00:00+03:00","sentAt":None}
add("Notifications","GET","/notifications",RR+"\nOwn notifications only","List notifications belonging to the token owner.",query="isRead=0 or 1, perPage=20, page=1",response={"data":[notif],"links":{},"meta":{"current_page":1,"total":1}},rules="perPage 1–100. No cross-user listing.")
add("Notifications","GET","/notifications/unread-count",RR,"Count the token owner's unread notifications.",response={"data":{"unreadCount":1}},codes="200 / 401 / 403")
add("Notifications","GET","/notifications/{id}",RR+"\nOwn notification","Read one notification without marking it read.",response=wrap(notif),codes="200 / 401 / 403 / 404")
add("Notifications","PATCH","/notifications/{id}/read",RR+"\nOwn notification","Mark a notification as read; repeated calls keep it read.",response=wrap(dict(notif,isRead=True)),codes="200 / 401 / 403 / 404")

rt={"id":5,"data_type_code":"UNIT","data_type_name_en":"Unit of Measurement","data_type_name_sw":"Kipimo","description_en":"Units used to measure indicators.","description_sw":None,"status":"active"}
rv={"id":11,"data_type_id":5,"data_value_code":"NUMBER","data_value_name_en":"Number","data_value_name_sw":"Idadi","parent_id":None,"value":None,"effective_from":None,"effective_to":None,"status":"active"}
add("Reference data","GET","/reference-data",RR,"List reference types such as SECTOR and UNIT.",query="status=active or inactive, perPage=20, page=1",response=page(rt))
add("Reference data","POST","/reference-data",RW,"Create a reference type.",inp={"dataTypeCode":"UNIT","dataTypeNameEn":"Unit of Measurement","dataTypeNameSw":"Kipimo","descriptionEn":"Units used to measure indicators.","descriptionSw":None,"status":"active"},response=wrap(rt),rules="Required: dataTypeCode (unique), dataTypeNameEn. Other text nullable. Text max 255. status defaults active; allowed active/inactive.")
add("Reference data","GET","/reference-data/{id}",RR,"Read a reference type.",response=wrap(rt),codes="200 / 401 / 403 / 404")
add("Reference data","PATCH","/reference-data/{id}",RW,"Update a reference type.",inp={"descriptionEn":"Measurement units used across datasets.","status":"active"},response=wrap(rt),rules="Optional fields: dataTypeCode, dataTypeNameEn, dataTypeNameSw, descriptionEn, descriptionSw, status. Use camelCase input; output uses snake_case.")
add("Reference data","DELETE","/reference-data/{id}",RW,"Set the type inactive; preserve it and its history.",response=wrap(dict(rt,status="inactive")),rules="Does not hard-delete or automatically mark every child value inactive.")
add("Reference data","GET","/reference-data/{id}/values",RR,"List values belonging to one reference type.",query="status=active or inactive, perPage=20, page=1",response=page(rv))
add("Reference data","POST","/reference-data/{id}/values",RW,"Create a value under the type ID in the URL.",inp={"dataValueCode":"NUMBER","dataValueNameEn":"Number","dataValueNameSw":"Idadi","parentId":None,"value":None,"effectiveFrom":None,"effectiveTo":None,"status":"active"},response=wrap(rv),rules="Required: dataValueCode, dataValueNameEn. Code unique within the type. parentId is another reference value ID; value is a nullable string, not an array. Dates YYYY-MM-DD or null; end must not precede start. No dataTypeId needed in body.")
add("Reference data","GET","/reference-data/{id}/values/{valueId}",RR,"Read one value belonging to the specified type.",response=wrap(rv),codes="200 / 401 / 403 / 404")
add("Reference data","PATCH","/reference-data/{id}/values/{valueId}",RW,"Update a reference value, hierarchy or validity dates.",inp={"dataValueNameSw":"Idadi","parentId":None,"effectiveFrom":"2026-07-01","effectiveTo":None},response=wrap(rv),rules="All create fields are optional here. Parent relationships must not create cycles. A value from another URL type returns 404.")
add("Reference data","DELETE","/reference-data/{id}/values/{valueId}",RW,"Set one value inactive without removing history.",response=wrap(dict(rv,status="inactive")))

ds={"id":6,"institutionId":2,"departmentId":None,"datasetCode":"CBE/2026/0001","datasetName":"CBE Staff Establishment","status":"draft","collectionMethod":"manual","priority":None,"frequencies":["annual","quarterly"],"sectorIds":[9],"subsectorIds":[],"latestTemplateVersionId":None}
add("Dataset definitions","GET","/datasets",D,"List datasets visible within the user's scope.",query="status=draft / active / inactive, perPage=20, page=1",response=page(ds),rules="Default page size 20; max 100. Actual response also contains a message.")
add("Dataset definitions","POST","/datasets",D,"Create a draft with sectors, source information and consumers in one request.",inp={"institutionId":2,"departmentId":None,"datasetName":"CBE Staff Establishment","description":"Sample staff numbers by category.","collectionMethod":"manual","sourceSystemName":None,"sourceDescription":"Collected by the human resources unit.","frequencies":["annual","quarterly"],"sectors":[{"sectorId":9,"subsectorIds":[]}],"consumers":[{"name":"Ministry of Industry and Trade","shortName":"MIT","description":None}]},response=wrap(ds),rules="Required: institutionId, datasetName, frequencies, sectors. datasetCode and createdBy are generated; do not send. Source method: manual/system/hybrid; system/hybrid require sourceSystemName. A consumer can instead be {\"consumerId\":3}. Only draft status accepted on create.")
add("Dataset definitions","GET","/datasets/{id}",D,"Read dataset metadata and configured IDs.",response=wrap(ds),rules="Full response also includes description, sourceSystemName, sourceDescription, consumers, priorityUpdatedBy/At, createdBy and timestamps.",codes="200 / 401 / 403 / 404")
add("Dataset definitions","PATCH","/datasets/{id}",D,"Update draft details, source information, consumers or set inactive.",inp={"datasetName":"CBE Staff Establishment","description":"Staff at the end of the reporting period.","consumers":[{"consumerId":3}]},response=wrap(ds),rules="Editable fields also include frequencies, collectionMethod, sourceSystemName, sourceDescription and status (draft/inactive). Active datasets must be reopened before editing configuration; status inactive may be set directly. Institution, department, code and sectors cannot be changed here. consumers: [] clears links; omit to preserve.")
add("Dataset definitions","DELETE","/datasets/{id}",D,"Deactivate the dataset; retain related records and snapshots.",response=wrap(dict(ds,status="inactive")))
add("Dataset definitions","GET","/data-consumers","MOA · IA · IDO · DDO · MDO","Search reusable consumer names for dataset forms.",query="search=Ministry, perPage=20, page=1",response=page({"id":3,"name":"Ministry of Industry and Trade","shortName":"MIT","description":None}),rules="Consumers are created inline on dataset POST/PATCH. No standalone consumer POST route.")

period={"id":7,"institutionId":2,"parentId":6,"periodCode":"FY-2026-07-Q1","label":"2026/2027 Q1","periodType":"quarterly","yearType":"financial","quarter":1,"periodNumber":1,"startDate":"2026-07-01","endDate":"2026-09-30","deadline":"2026-09-30","status":"open","isOpen":True,"createdBy":1}
annual=dict(period,id=6,parentId=None,periodCode="FY-2026-07-ANNUAL",label="2026/2027",periodType="annual",quarter=None,periodNumber=None,endDate="2027-06-30",deadline="2027-07-15")
add("Reporting periods","GET","/reporting-periods",PR,"List institution reporting periods.",query="institutionId, parentId, periodType, status=open / closed, perPage, page",response=page(period))
add("Reporting periods","POST","/reporting-periods",PW,"Create an annual year or a child period.",inp={"institutionId":2,"periodType":"annual","yearType":"financial","startDate":"2026-07-01","endDate":"2027-06-30","deadlineDays":15},response=wrap(annual),rules="Annual: full 12 months, start on first day; calendar year starts January 1. Children: send parentId instead of annual dates/yearType; quarterly requires quarter 1–4; monthly/semiannual/weekly/daily require periodNumber (max 12/2/53/366). Send exactly one of deadline or deadlineDays (0–365). Parent must be open. Duplicate or overlapping periods: 409.",codes="201 / 401 / 403 / 404 / 409 / 422")
add("Reporting periods","GET","/reporting-periods/{id}",PR,"Read period dates and effective open state.",response=wrap(period),rules="isOpen is false if this period or its annual parent is closed.",codes="200 / 401 / 403 / 404")
add("Reporting periods","PATCH","/reporting-periods/{id}",PW,"Change deadline or open/closed status.",inp={"deadline":"2026-09-30","status":"open"},response=wrap(period),rules="Deadline cannot precede period end. Institution, identity, dates, type and numbering are immutable. Reopening a child requires an open annual parent.")
add("Reporting periods","DELETE","/reporting-periods/{id}",PW,"Close a reporting period rather than delete it.",response=wrap(dict(period,status="closed",isOpen=False)))
add("Reporting periods","POST","/reporting-periods/{id}/quarters",PW,"Generate Q1–Q4 under an annual period.",inp={"deadlineDays":0},response={"data":[period,{"id":8,"label":"2026/2027 Q2","startDate":"2026-10-01","endDate":"2026-12-31","deadline":"2026-12-31"}]},rules="Response contains all four quarter objects (only two shown here). Existing quarters are reused; their deadlines are preserved. Annual parent must be open.",codes="200 / 401 / 403 / 404 / 409 / 422")

cal={"id":5,"datasetId":6,"reportingPeriodId":7,"periodLabel":"2026/2027 Q1","reportingYear":"2026/2027","periodType":"quarterly","responsibleUserId":7,"deadlineDays":0,"deadline":"2026-09-30","reminderDays":[10],"remindersEnabled":True,"submittedAt":None}
add("Dataset reporting calendar","GET","/datasets/{datasetId}/reporting-calendar",D,"Read reporting assignments, deadlines and reminder settings.",query="page=1 (fixed page size 20)",response=page(cal))
add("Dataset reporting calendar","PUT","/datasets/{datasetId}/reporting-calendar",D,"Create or update one assignment for a dataset and reporting period.",inp={"reportingPeriodId":7,"responsibleUserId":7,"deadlineDays":0,"reminderDays":[10],"remindersEnabled":True},response=wrap(cal),rules="Required: reportingPeriodId, responsibleUserId, deadlineDays (0–365). Period must be open, same institution and match dataset frequency. Responsible officer: active IDO of the institution, or active DDO of its department. Deadline = period end + deadlineDays; not the period's separate deadline field. Submitted assignments cannot change. Omitted reminderDays resets to [7,1]; omitted remindersEnabled resets false. Do not send deadline or submittedAt.")
add("Dataset priority","PATCH","/datasets/{datasetId}/priority","MDO only\nSame department for department datasets","Change an already initialized priority with an audit reason.",inp={"priority":"high","reason":"Updated ministry reporting priorities."},response=wrap({"datasetId":6,"priority":"high","priorityUpdatedBy":12,"priorityUpdatedAt":"2026-10-20T12:00:00+03:00"}),rules="priority: low/medium/high; reason required, max 2000. Cannot set the first priority through this route (422). Initial assignment is reserved for the service's duringReview method; submission integration is a separate step.")

ind={"id":8,"indicatorCode":"CBE/IND/2026/0001","nameEn":"Number of staff","nameSw":"Idadi ya watumishi","descriptionEn":"Staff employed at the end of the reporting period.","descriptionSw":None,"dataType":"integer","unitId":11,"aggregationRule":"none","status":"active","createdBy":1}
indbody={"nameEn":"Number of staff","nameSw":"Idadi ya watumishi","descriptionEn":"Staff employed at the end of the reporting period.","dataType":"integer","unitId":11,"aggregationRule":"none"}
ilink={"id":7,"datasetId":6,"indicatorId":8,"isRequired":True,"displayOrder":1,"indicator":ind}
add("Dataset indicators","GET","/datasets/{datasetId}/indicators",D,"List indicators attached to the dataset.",query="perPage=20, page=1",response=page(ilink),rules="Outer id is the link ID; indicatorId and indicator.id identify the catalogue record.")
add("Dataset indicators","POST","/datasets/{datasetId}/indicators",D+"\nDraft dataset","Create an indicator and attach it, or attach an existing indicator.",inp={"indicator":indbody,"isRequired":True,"displayOrder":1},response=wrap(ilink),rules="Alternative body: {\"indicatorId\":8,\"isRequired\":true,\"displayOrder\":1}. Send exactly one of indicatorId/indicator. Nested indicator must not contain status, indicatorCode or createdBy. New code is generated using dataset institution. displayOrder 1–2147483647; isRequired defaults true. Duplicate link: 409.",codes="201 / 401 / 403 / 404 / 409 / 422")
add("Dataset indicators","PATCH","/datasets/{datasetId}/indicators/{indicatorId}",D+"\nDraft dataset","Change required flag or display order on an existing attachment.",inp={"isRequired":True,"displayOrder":2},response=wrap(dict(ilink,displayOrder=2)),rules="Use catalogue indicator ID (8), not link ID (7). Does not edit indicator definition.")
add("Dataset indicators","DELETE","/datasets/{datasetId}/indicators/{indicatorId}",D+"\nDraft dataset","Detach an indicator; keep its catalogue record.",response={"message":"Indicator imeondolewa kwenye dataset."},rules="Cannot detach an indicator while dimension assignments still refer to it. Use catalogue indicator ID in URL.")

add("Indicator catalogue","GET","/indicators",C,"Browse shared indicator definitions.",query="status=active / inactive, dataType, perPage, page",response=page(ind))
add("Indicator catalogue","POST","/indicators",C,"Create a standalone indicator without a dataset attachment.",inp=dict(indbody,status="active"),response=wrap(ind),rules="Required nameEn, dataType. Optional nameSw, descriptionEn/Sw, unitId, aggregationRule, status. Code auto-generated from creator institution; indicatorCode/createdBy prohibited. Attach it separately with dataset indicatorId.")
add("Indicator catalogue","GET","/indicators/{id}",C,"Read one indicator definition.",response=wrap(ind),codes="200 / 401 / 403 / 404")
add("Indicator catalogue","PATCH","/indicators/{id}",CW,"Edit an indicator definition if no active dataset uses it.",inp={"nameSw":"Idadi ya watumishi","unitId":11,"aggregationRule":"none"},response=wrap(ind),rules="Create fields optional; code and creator immutable. Catalogue is shared: a change can affect other draft datasets using this record.")
add("Indicator catalogue","DELETE","/indicators/{id}",CW,"Set indicator inactive if it is not used by an active dataset.",response=wrap(dict(ind,status="inactive")))

dim={"id":2,"dimensionCode":"CBE_STAFF_CATEGORY","nameEn":"Staff Category","nameSw":"Kundi la Watumishi","dataType":"reference","referenceTypeId":None,"status":"active","options":[{"id":3,"code":"TEACHING","name_en":"Teaching Staff","name_sw":"Watumishi wa Kufundisha"},{"id":4,"code":"ICT","name_en":"ICT Staff","name_sw":"Watumishi wa TEHAMA"}]}
dl={"id":2,"datasetId":6,"dimensionId":2,"isRequired":True,"displayOrder":1,"indicatorIds":[8],"dimension":dim}
db={"dimensionCode":"CBE_STAFF_CATEGORY","nameEn":"Staff Category","nameSw":"Kundi la Watumishi","dataType":"reference","referenceTypeId":None,"options":[{"code":"TEACHING","nameEn":"Teaching Staff","nameSw":"Watumishi wa Kufundisha"},{"code":"ICT","nameEn":"ICT Staff","nameSw":"Watumishi wa TEHAMA"}]}
add("Dataset dimensions","GET","/datasets/{datasetId}/dimensions",D,"List dimension attachments, indicator assignments and manual options.",query="indicatorId=8, perPage=20, page=1",response=page(dl),rules="Optional indicatorId must belong to this dataset.")
add("Dataset dimensions","POST","/datasets/{datasetId}/dimensions",D+"\nDraft dataset","Create a dimension with manual options and attach it to selected indicators.",inp={"dimension":db,"indicatorIds":[8],"isRequired":True,"displayOrder":1},response=wrap(dl),rules="Alternative: dimensionId instead of dimension to reuse a catalogue record. Manual options require dataType reference, referenceTypeId null, and indicatorIds from this dataset. Option code uppercase letters/digits/_/-, max100; nameEn required. Up to1000 options. Duplicate attachment:409.",codes="201 / 401 / 403 / 404 / 409 / 422")
add("Dataset dimensions","PATCH","/datasets/{datasetId}/dimensions/{dimensionId}",D+"\nDraft dataset","Change dimension attachment's required flag or display order.",inp={"isRequired":True,"displayOrder":2},response=wrap(dict(dl,displayOrder=2)),rules="URL uses catalogue dimensionId. Body accepts only isRequired/displayOrder; cannot change indicatorIds, dimensionId or definition here.")
add("Dataset dimensions","DELETE","/datasets/{datasetId}/dimensions/{dimensionId}",D+"\nDraft dataset","Detach a dimension while preserving its catalogue definition.",response={"message":"Dimension imeondolewa kwenye dataset."})
add("Dimension catalogue","GET","/dimensions",C,"Browse shared dimension definitions.",query="status=active / inactive, perPage=20, page=1",response=page(dim))
add("Dimension catalogue","GET","/dimensions/{id}",C,"Read a dimension and its options.",response=wrap(dim),rules="Full catalogue response also includes createdBy. There is no standalone POST /dimensions.",codes="200 / 401 / 403 / 404")
add("Dimension catalogue","PATCH","/dimensions/{id}",CW,"Edit dimension metadata if no active dataset uses it.",inp={"nameEn":"Staff Category","nameSw":"Kundi la Watumishi"},response=wrap(dim),rules="Optional nameEn/nameSw/dataType/referenceTypeId/status. dimensionCode/createdBy prohibited; options must be omitted. A manual-options dimension cannot change its dataType or referenceTypeId.")
add("Dimension catalogue","DELETE","/dimensions/{id}",CW,"Set a dimension inactive if no active dataset uses it.",response=wrap(dict(dim,status="inactive")))

target={"id":4,"datasetId":6,"indicatorId":8,"reportingPeriodId":7,"templateVersionId":None,"phase":"draft","targetScope":"dimensions","dimensionValues":[{"dimensionId":2,"value":4}],"targetValue":"20.000000","notes":"Target ya watumishi wa TEHAMA mwisho wa Q1.","status":"active","createdBy":1}
add("Indicator targets","GET","/datasets/{datasetId}/targets",D,"List targets by indicator, period, scope or status.",query="indicatorId, reportingPeriodId, targetScope=total / dimensions, status=active / inactive, perPage, page",response=page(target))
add("Indicator targets","POST","/datasets/{datasetId}/targets",D,"Create a numeric target for one period and one dimension combination.",inp={"indicatorId":8,"reportingPeriodId":7,"targetScope":"dimensions","dimensionValues":[{"dimensionId":2,"value":4}],"targetValue":"20","notes":"Target ya watumishi wa TEHAMA mwisho wa Q1."},response=wrap(target),rules="Required indicatorId, reportingPeriodId, targetValue as a numeric STRING. Draft: omit templateVersionId. Active: supply a valid templateVersionId; validate against its snapshot. Period must have a valid dataset calendar. For total scope use dimensionValues: []. Each dimension appears once; separate targets for ICT and Teaching. Duplicate target identity:409.",codes="201 / 401 / 403 / 404 / 409 / 422")
add("Indicator targets","GET","/datasets/{datasetId}/targets/{targetId}",D,"Read one target belonging to the dataset.",response=wrap(target),codes="200 / 401 / 403 / 404")
add("Indicator targets","PATCH","/datasets/{datasetId}/targets/{targetId}",D,"Update target value, notes or active/inactive status.",inp={"targetValue":"25","notes":"Revised staffing target.","status":"active"},response=wrap(dict(target,targetValue="25.000000",notes="Revised staffing target.")),rules="Indicator, period, template version, targetScope and dimensionValues are immutable. Versioned targets cannot be edited while dataset is reopened as draft. Period and configuration validation applies.")
add("Indicator targets","DELETE","/datasets/{datasetId}/targets/{targetId}",D,"Set a target inactive and retain its history.",response=wrap(dict(target,status="inactive")),rules="Uses the same update service and its version/state checks.")

add("Activation and versions","GET","/datasets/{datasetId}/configuration-progress",D,"Check wizard completion and activation blockers.",response=wrap({"datasetId":6,"status":"draft","steps":{"datasetDetails":{"complete":True,"errors":[]},"reportingPlan":{"complete":True,"errors":[]},"indicatorsAndDimensions":{"complete":True,"errors":[]},"targets":{"complete":True,"errors":[],"optional":True}},"canActivate":True}),rules="Targets are optional, but any configured targets must validate. This is a read operation, not activation.")
add("Activation and versions","GET","/datasets/{datasetId}/sectors",D,"Read sectors chosen during dataset creation.",response=wrap([{"sectorId":9,"sectorCode":"TRADE","nameEn":"Trade Sector","nameSw":"Sekta ya Biashara","subsectors":[]}]),rules="No standalone sector update endpoint. POST /datasets supplies sectors.")
version={"id":2,"dataset_definition_id":6,"version_number":1,"template_format":"json","template_content":{"schemaVersion":2,"datasetId":6},"created_by":1}
add("Activation and versions","POST","/datasets/{datasetId}/activate",D+"\nDraft dataset","Validate the configuration, activate dataset and create an immutable template snapshot.",response=wrap(version),rules="Requires valid details/sectors, at least one active indicator, valid dimensions and at least one valid open unsubmitted calendar. Validates active draft targets and binds them to the new version. Full template_content includes source/consumers, frequencies, sectors, indicators, dimensions and reportingCalendar. Response is a template version, not a dataset.")
add("Activation and versions","POST","/datasets/{datasetId}/draft",D,"Reopen a dataset for configuration changes; preserve historical versions.",response=wrap({"datasetId":6,"status":"draft"}),rules="Already-draft calls remain draft. Reactivation creates a new version.",codes="200 / 401 / 403 / 404 / 422")
add("Activation and versions","GET","/datasets/{datasetId}/template-versions",D,"List immutable template version metadata.",query="perPage=20, page=1",response=page({"id":2,"dataset_definition_id":6,"version_number":1,"template_format":"json","effective_from":"2026-10-20","created_by":1}),rules="List excludes template_content; GET the specific version for the complete snapshot.")
add("Activation and versions","GET","/datasets/{datasetId}/template-versions/{versionId}",D,"Read a specific full snapshot belonging to this dataset.",response=wrap(version),rules="Raw model serialization uses snake_case; template_content includes configuration arrays. No update/delete version endpoint.",codes="200 / 401 / 403 / 404")

# Ensure every included route is documented once and every documented route exists.
inventory=json.loads((ROOT/"routes.json").read_text(encoding="utf-8-sig"))
excluded=("AuthController","AdministrationController","DashboardController","SearchController")
expected=set()
for r in inventory:
    uri=r["uri"]
    if not uri.startswith("api/"): continue
    if any(x in r["action"] for x in excluded): continue
    for method in r["method"].split("|"):
        if method != "HEAD": expected.add((method,"/"+uri))
actual={(r["method"],r["path"] if r["path"]=="/api/health" else "/api/v1"+r["path"]) for r in rows}
assert len(actual)==len(rows), "Duplicate documented routes"
assert actual==expected, f"Missing: {expected-actual}; extra: {actual-expected}"
(ROOT/"documented-endpoints.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")

doc=Document()
sec=doc.sections[0]
# A wide API matrix needs eight readable columns; the user supplied the matrix layout.
sec.page_width=Inches(16.54); sec.page_height=Inches(11.69)
sec.top_margin=sec.bottom_margin=Inches(.55)
sec.left_margin=sec.right_margin=Inches(.5)
sec.header_distance=sec.footer_distance=Inches(.22)
styles=doc.styles
styles["Normal"].font.name="Calibri"; styles["Normal"].font.size=Pt(11)
styles["Normal"].paragraph_format.space_after=Pt(6)
for sn in ("Title","Subtitle","Heading 1","Heading 2"):
    styles[sn].font.color.rgb=RGBColor(0,0,0)
styles["Title"].font.size=Pt(26)
styles["Heading 1"].font.size=Pt(16)
styles["Heading 2"].font.size=Pt(13)
styles["Heading 1"].paragraph_format.space_before=Pt(14)
styles["Heading 1"].paragraph_format.space_after=Pt(8)
doc.core_properties.title="Viwanda Portal Backend API Reference"
doc.core_properties.subject="Implemented endpoints excluding BE1"
doc.core_properties.author="Viwanda Portal"
doc.add_paragraph("Viwanda Portal Backend API Reference","Title")
doc.add_paragraph("Implemented endpoints outside BE1 • Verified 20 October 2026","Subtitle")
doc.add_paragraph(f"This reference documents {len(rows)} HTTP method and path combinations from the current backend routes, controllers and services. It is intended for Postman testing and frontend integration. The endpoint matrix follows the requested S/N, ENDPOINT, ACCESS, DESCRIPTION, METHOD, HEADERS, RESPONSE/INPUT and STATUS format.")
doc.add_paragraph("Scope excludes BE1 authentication, account activation and password reset, administration of institutions/departments/users/roles/permissions, portal settings, approval circles, delegations, dashboard and search. Examples of those endpoints supplied with the request were used only as a formatting guide. Framework health /up is not included.")
doc.add_paragraph("Using this reference","Heading 1")
doc.add_paragraph("Set {{baseUrl}} to http://HOST:8000/api/v1. Prefix every matrix endpoint with this base URL, except /api/health, which is an absolute path on the same host. Example: GET {{baseUrl}}/datasets/6/indicators. Replace HOST, {token} and path placeholders with real values.")
doc.add_paragraph("All non-public endpoints require a valid Sanctum bearer token and an active user. Requests with a JSON body must use raw JSON in Postman and Content-Type: application/json. Field names are case-sensitive: camelCase request fields cannot be replaced by snake_case database column names.")
doc.add_paragraph("Example IDs come from the CBE testing flow and must be replaced where your database differs. The examples are not a seed script: codes subject to uniqueness cannot be posted twice. Response examples show selected fields, not a promise that other response fields are absent.")
doc.add_paragraph("Access rules used in the matrix","Heading 1")
for text in [
    "D — Dataset scope: MOA can access all datasets. IA and IDO access their own institution's datasets. DDO accesses its institution and its assigned department. Dataset access uses role checks; a generic permission alone does not grant these routes.",
    "C — Catalogue scope: MOA, IA, IDO and DDO can read shared indicators and dimensions. Editing/deactivation requires the creator or MOA. Definitions used by an active dataset cannot be changed.",
    "P — Reporting periods: MOA has access across institutions. Other users need submission_periods.view or submission_periods.configure to read, and submission_periods.configure for writes, scoped to their institution.",
    "Reference data reads are shared with authenticated active users; writes require reference_data.manage (seeded for MOA and IA). Audit reads require audit_logs.view.ministry through the audit.readAll gate. Notifications are private to the token owner.",
    "Role abbreviations: MOA Ministry administrator; IA Institutional Admin; IDO Institution Data Officer; DDO Department Data Officer; MDO Ministry Data Officer. Seeded role assignments can change; the running checks and assigned permissions determine access."
]: doc.add_paragraph(text)
doc.add_paragraph("Responses and status codes","Heading 1")
doc.add_paragraph("Most lists return Laravel pagination at the root: current_page, data, links, per_page and total. Audit and notification lists use resource pagination: data, links and meta. Single-record responses usually wrap the record in data. Reference records and template versions retain snake_case fields. Page size defaults to 20 and is limited to 100 where perPage is supported; reporting-calendar lists use a fixed 20.")
doc.add_paragraph("200 success; 201 created; 401 missing/invalid authentication; 403 insufficient access or inactive account; 404 missing or out-of-scope record; 409 explicit duplicate/conflict; 422 input or business validation failure. Unexpected infrastructure or audit persistence errors may return 500. STATUS lists the principal endpoint outcomes rather than every server-level failure.")
doc.add_paragraph('Typical validation response: {"message":"The given data was invalid.","errors":{"fieldName":["Validation message."]}}. Exact messages vary by validation rule and language.')
doc.add_page_break()

widths=[.38,2.12,1.65,2.05,.63,1.50,6.30,.91]
assert abs(sum(widths)-15.54)<.001
cols=["S/N","ENDPOINT","ACCESS","DESCRIPTION","METHOD","HEADERS","RESPONSE/INPUT","STATUS"]
def xml(tag,**attrs):
    e=OxmlElement("w:"+tag)
    for k,v in attrs.items(): e.set(qn("w:"+k),str(v))
    return e
def make_table():
    table=doc.add_table(rows=1,cols=8)
    table.autofit=False; table.alignment=WD_TABLE_ALIGNMENT.CENTER
    pr=table._tbl.tblPr
    borders=xml("tblBorders")
    for edge in ("top","left","bottom","right","insideH","insideV"):
        borders.append(xml(edge,val="single",sz="4",color="D9D9D9"))
    pr.append(borders)
    margins=xml("tblCellMar")
    for edge in ("top","bottom"): margins.append(xml(edge,w="90",type="dxa"))
    for edge in ("left","right"): margins.append(xml(edge,w="75",type="dxa"))
    pr.append(margins)
    for i,w in enumerate(widths):
        table.columns[i].width=Inches(w)
        table.rows[0].cells[i].width=Inches(w)
    table.rows[0]._tr.get_or_add_trPr().append(xml("tblHeader"))
    for i,title in enumerate(cols):
        cell=table.rows[0].cells[i]; cell.text=title
        cell._tc.get_or_add_tcPr().append(xml("shd",fill="20364D"))
        for p in cell.paragraphs:
            p.paragraph_format.space_after=Pt(0)
            for run in p.runs:
                run.font.size=Pt(9); run.bold=True; run.font.color.rgb=RGBColor(255,255,255)
    return table

module_notes={
"Reference data":"Reference types define categories; reference values hold choices such as TRADE and NUMBER. parentId links a value to a parent value, not to a reference type. effectiveFrom/effectiveTo are optional validity dates.",
"Dataset definitions":"Capture source, sectors and consumers during dataset creation. Sector IDs are reference VALUE IDs under SECTOR, not the SECTOR type ID. Subsector IDs must belong to the selected sector.",
"Reporting periods":"Create the reporting year and child periods before assigning the dataset calendar. A period is institution-specific and can be reused by compatible datasets in that institution.",
"Dataset reporting calendar":"A calendar links the dataset, period and responsible officer. Its calculated deadline is separate from the generic reporting period deadline. Reminder execution requires the scheduler.",
"Dataset indicators":"Configure the dataset while draft. isRequired controls whether the indicator is mandatory during data capture; it does not mean the indicator is a target.",
"Indicator catalogue":"dataType: integer, decimal, text, boolean or date. Aggregation: none, sum, average, min, max or latest. Numeric types allow all rules; date allows none/min/max/latest; text and boolean allow none/latest. unitId applies only to numeric indicators and must reference an active, currently valid value under UNIT.",
"Dataset dimensions":"Manual options avoid a trip to Reference Data. Example: Staff Category offers Teaching and ICT. Reference-backed mode uses referenceTypeId instead of manual options. Other supported dimension types: text, integer, decimal, boolean and date.",
"Indicator targets":"Targets apply to numeric indicators. targetValue must be a string with up to 18 integer digits and up to 6 decimal places; exponent notation is not accepted. A dimensions target describes one combination (for example ICT staff), not several options of the same dimension. notes is optional context.",
"Activation and versions":"Wizard order: dataset details → reporting plan → indicators and dimensions → optional targets → activation. Activation creates a snapshot and binds active draft targets. Reopening preserves old versions; new configuration becomes a new version on activation."
}
last=None; tab=None
for n,r in enumerate(rows,1):
    if r["module"]!=last:
        if last: doc.add_paragraph()
        doc.add_paragraph(r["module"],"Heading 1")
        if r["module"] in module_notes: doc.add_paragraph(module_notes[r["module"]])
        tab=make_table(); last=r["module"]
    tr=tab.add_row()
    tr._tr.get_or_add_trPr().append(xml("cantSplit"))
    texts=[str(n),r["path"],r["access"],r["desc"],r["method"],r["headers"],r["detail"],r["codes"].replace(" / ","\n")]
    for i,(cell,text,w) in enumerate(zip(tr.cells,texts,widths)):
        cell.width=Inches(w); cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if n%2==0: cell._tc.get_or_add_tcPr().append(xml("shd",fill="F2F5F8"))
        cell.text=text
        for p in cell.paragraphs:
            p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1.05
            if i in (0,4,7): p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                run.font.name="Calibri"; run.font.size=Pt(10)
doc.add_paragraph("Testing sequence and implementation boundaries","Heading 1")
for text in [
    "1. Ensure reference values exist for the sector and any units. Create the dataset with those value IDs, source information and consumers.",
    "2. Create the annual reporting period; generate or create its child periods. Save a calendar per dataset/period with an eligible responsible officer.",
    "3. Create or attach indicators. Attach dimensions and their manual options to the applicable catalogue indicator IDs. Validate the wizard progress.",
    "4. Create optional targets while draft, using reportingPeriodId and dimension option IDs; omit templateVersionId. Activate the dataset, then verify targets now show phase versioned and the returned templateVersionId.",
    "5. Read the immutable template version for the eventual data-entry form. Actual submission, workflow review and sector performance calculations are separate from the configuration endpoints documented here.",
    "Reminder processing uses the datasets:send-reminders console command, scheduled hourly. There is no HTTP endpoint to run it. With deadline 2026-09-30 and reminderDays [10], the reminder date is 2026-09-20. Past reminder dates are not automatically replayed. Email/SMS delivery and submission-driven markSubmitted integration must not be inferred from a successful calendar response.",
    "Initial priority is reserved for submission review through DatasetPriorityService::duringReview. The public PATCH only changes an initialized priority. Current route registration does not expose the submission controller, even though it is imported.",
    "These tables describe current code, not a guarantee that every operation succeeds for every database state. Mutation paths record audit events; creation success alone does not verify subsequent queue, scheduler or external delivery behavior."
]: doc.add_paragraph(text)
doc.add_paragraph("Verification basis","Heading 1")
doc.add_paragraph("Route inventory: php artisan route:list --json --except-vendor. Cross-checked against routes/api.php, the corresponding API V1 controllers, DTOs, services, resources and authorization checks. Each included method/path pair is represented once. API requests were not executed and database records were not changed for this documentation task.")
doc.add_paragraph("Principal source files: routes/api.php; AuditEventController; NotificationController; ReferenceDataController; DatasetController; DatasetPlanningController; DatasetIndicatorController; IndicatorController; DatasetConfigurationController; DimensionController; ReportingPeriodController; IndicatorTargetController; their associated services and DTOs.")
header=sec.header.paragraphs[0]
header.text="VIWANDA PORTAL  |  BACKEND API REFERENCE"
header.runs[0].font.size=Pt(9); header.runs[0].font.color.rgb=RGBColor(0,0,0)
footer=sec.footer.paragraphs[0]
footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run("20 October 2026  •  Page ")
field=xml("fldSimple",instr="PAGE"); footer._p.append(field)
for run in footer.runs: run.font.size=Pt(9)
doc.save(OUT)
print(json.dumps({"output":str(OUT),"endpoints":len(rows),"modules":dict(Counter(r["module"] for r in rows))},indent=2))

# Preserve the later workflow/submission extension when rebuilding the base reference.
from extend_workflow_reference import extend_reference
extend_reference(OUT)
