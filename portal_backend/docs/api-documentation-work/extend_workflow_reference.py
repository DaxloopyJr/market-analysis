"""Extend the retained API reference with the workflow and submission contracts."""

import json
from collections import Counter
from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt


ROOT = Path(__file__).resolve().parent
MODULES = ("Workflow configuration", "Submissions")


def endpoint_rows():
    rows = []

    def add(module, method, path, access, description, body=None, response=None, rules="", query=None, codes="200 / 401 / 403 / 404 / 409 / 422"):
        parts = []
        if query:
            parts.append("Query: " + query)
        if body is not None:
            parts.append("Input:\n" + json.dumps(body, indent=2))
        elif method != "GET":
            parts.append("Input: no request body.")
        if response is not None:
            parts.append("Response example (selected fields):\n" + json.dumps(response, indent=2))
        if rules:
            parts.append("Rules: " + rules)
        rows.append(dict(module=module, method=method, path=path, access=access,
                         desc=description, detail="\n\n".join(parts), codes=codes,
                         headers="Authorization: Bearer {token}\nAccept: application/json" +
                         ("\nContent-Type: application/json" if body is not None else "")))

    admin = "MOA: shared ministry\nIA: own institution\nWorkflow scope W"
    permission = admin + "\napproval_circle.manage.ministry or approval_circle.manage.institution"
    officer = "Assigned active IDO / DDO\nSubmission scope S"
    reader = "MOA / own IA / assignee / eligible reviewer\nSubmission scope S"
    reviewer = "Current configured reviewer\nSubmission scope S; no self-review"
    steps = [
        dict(step_name="Ministry Review", required_role_code="MDO", action="review", level="ministry", can_return=True),
        dict(step_name="Ministry Approval", required_role_code="MDD", action="approve", level="ministry", can_return=True),
        dict(step_name="Publication", required_role_code="MDD", action="publish", level="ministry", can_return=True),
    ]
    circle = dict(id=1, name="Ministry Data Approval", institution_id=None, department_id=None,
                  scope_key="global", version_number=1, status="draft", is_active=False)
    step_example = dict(id=1, approval_circle_id=1, sequence=1, **steps[0], assigned_user_id=None)
    circle_with_steps = dict(circle, steps=[dict(id=i, approval_circle_id=1, sequence=i,
                             **step, assigned_user_id=None) for i, step in enumerate(steps, 1)])
    add(MODULES[0], "GET", "/approval-circles", permission, "List workflow versions in the administrator's scope.",
        response={"data": [circle]}, rules="Not paginated. Each item also includes steps. MOA sees global ministry versions; IA sees only its institution versions.", codes="200 / 401 / 403")
    add(MODULES[0], "POST", "/approval-circles", permission, "Create a new draft workflow. The example is for MOA.",
        body=dict(name="Ministry Data Approval", steps=steps), response={"data": circle},
        rules="Response also contains all steps. name max120; steps 1-30. Sequence follows array order. Omit institution_id, department_id and scope_key (prohibited). Active role must match level. assigned_user_id is optional for institution steps; non-null ministry assignees are prohibited. can_return defaults true. See institution example after the table.", codes="201 / 401 / 403 / 422")
    add(MODULES[0], "GET", "/approval-circles/{id}", admin, "Read one scoped workflow with its ordered steps.",
        response={"data": dict(circle, steps=[step_example])}, rules="Steps shown here are an excerpt; the created ministry example has three. Out-of-scope ID returns 404.", codes="200 / 401 / 403 / 404")
    add(MODULES[0], "PUT", "/approval-circles/{id}", admin, "Replace draft workflow name and complete step list.",
        body=dict(name="Ministry Data Approval", steps=steps), response={"data": circle},
        rules="Both name and steps are required. Response includes replacement steps. Active or retired version:409; clone first. Replacing steps recreates their IDs; refresh after saving. Institution steps cannot publish.")
    add(MODULES[0], "PUT", "/approval-circle-steps/{step}", permission, "Update one step in a draft workflow.",
        body=dict(step_name="Ministry Review", can_return=True), response={"data": circle},
        rules="Optional fields: step_name, required_role_code, assigned_user_id, action, level, can_return. Returns the WHOLE circle with steps. All step rows are recreated by the current implementation: refresh IDs. No sequence field; reorder through PUT circle.")
    add(MODULES[0], "POST", "/approval-circles/{id}/activate", admin, "Activate a draft and retire the previous active version in the same scope.",
        response={"data": dict(circle, status="active", is_active=True)},
        rules="Response includes steps. Institution path ends approve, has no publish. Ministry path includes approve and exactly one final publish. Review must precede approval. Existing submissions retain their pinned versions.")
    add(MODULES[0], "POST", "/approval-circles/{id}/clone", admin, "Copy a scoped workflow into the next draft version for editing.",
        response={"data": dict(circle, id=2, version_number=2)},
        rules="Response includes copied steps with new IDs. Activate separately. For old institution workflows, clone omits the obsolete publication step only from the new draft; original stays unchanged. Role and assignee validation still applies.", codes="201 / 401 / 403 / 404 / 422")

    snapshot = dict(id=1, reportingCalendarId=9, datasetId=2, reportingPeriodId=46,
                    periodLabel="2026/2027 Q2", templateVersionId=9, workflowVersionId=None,
                    ministryWorkflowVersionId=None, workflowStage=None, status="draft", revision=0,
                    attempt=0, currentStep=None, allowedActions=["save", "submit"],
                    deadline="2027-01-07", correctionDeadline=None, values=[], submittedAt=None, publishedAt=None)
    add(MODULES[1], "GET", "/submissions", reader, "List submissions visible to the signed-in user.",
        query="status, datasetId, reportingPeriodId, perPage=20, page=1",
        response={"current_page": 1, "data": [dict(id=1, datasetId=2, status="draft", revision=0)], "per_page": 20, "total": 1},
        rules="Items contain the submission snapshot described below. status: draft/submitted/under_review/returned/approved/published. perPage 1-100. Ministry reviewers see institution data only after handoff; pinned ministry version alone does not grant visibility.", codes="200 / 401 / 403 / 422")
    add(MODULES[1], "POST", "/submissions", officer, "Open a draft for one calendar, or return the existing submission for that calendar.",
        body=dict(reportingCalendarId=9), response={"data": snapshot},
        rules="201 new, 200 existing. Calendar/template links are set server-side. A new draft requires an active dataset/institution, global open period and parent, and valid entry window. No duplicate submission per calendar. reference also appears in response.", codes="200 / 201 / 401 / 403 / 404 / 409 / 422")
    add(MODULES[1], "GET", "/submissions/{id}", reader, "Read a submission, its frozen form, targets and action history.",
        response={"data": dict(id=1, status="draft", revision=0, values=[], targets=[], history=[], submittedVersions=[])},
        rules="Also returns all snapshot fields and template (immutable template_content). targets are active matches for dataset, period and template version. history contains recorded actions; submittedVersions contains immutable values per submit attempt. Nested history/revision models use snake_case. See snapshot field guide below.", codes="200 / 401 / 403 / 404")
    values = [dict(indicatorId=12, dimensionValues=[], value="20")]
    add(MODULES[1], "PUT", "/submissions/{id}/values", officer, "Save the full replacement set of draft or returned values.",
        body=dict(expectedRevision=0, values=values), response={"data": dict(id=1, status="draft", revision=1, values=values)},
        rules="values required as list, max10000; [] clears draft rows. Each row requires indicatorId and value (nullable in draft). dimensionValues max100, each with dimensionId/value. IDs/options must belong to frozen template. Duplicate combinations rejected. Integers may be integers/strings; fractional decimals MUST be strings (floats rejected), max18 integer digits and6 places. Responses use numeric strings. Editing needs valid entry/correction window.")
    add(MODULES[1], "POST", "/submissions/{id}/submit", officer, "Validate draft or returned data, record an attempt and begin its approval path.",
        body=dict(expectedRevision=1), response={"data": dict(id=1, status="submitted", revision=2, attempt=1, workflowVersionId=2,
              ministryWorkflowVersionId=1, workflowStage="institution", currentStep=dict(sequence=1, required_role_code="IHOD", action="review"), allowedActions=[])},
        rules="Required indicators/dimensions must be represented; every supplied value non-null; at least one row. Does not require every possible option combination. Institution first submit requires both active workflows; versions pinned together. Department starts ministry. No eligible first reviewer:409. Sets calendar submittedAt. Resubmit retains versions and restarts original first stage.")
    add(MODULES[1], "POST", "/submissions/{id}/review", reviewer, "Complete the pending review and move to the next configured step.",
        body=dict(expectedRevision=2, comments="Taarifa zimehakikiwa."), response={"data": dict(id=1, status="under_review", revision=3,
            workflowStage="institution", currentStep=dict(sequence=2, required_role_code="AO", action="approve"))},
        rules="Current step action must be review. comments optional, max10000. correctionDeadline prohibited. Missing next recipient:409 and transaction rolled back. Response currentStep is the next step, not the completed one.")
    add(MODULES[1], "POST", "/submissions/{id}/approve", reviewer, "Approve the pending step; final institution approval automatically hands off to ministry.",
        body=dict(expectedRevision=3, comments="Nimeidhinisha taarifa za taasisi."), response={"data": dict(id=1, status="under_review", revision=4,
            workflowStage="ministry", currentStep=dict(sequence=1, required_role_code="MDO", action="review"))},
        rules="Example is AO handing off to MDO. No separate handoff request. Final ministry approval before publish sets status approved. Current step action must be approve; comments optional; correctionDeadline prohibited. Missing next reviewer:409.")
    add(MODULES[1], "POST", "/submissions/{id}/return", reviewer + "\nCurrent step can_return=true", "Return data to its assigned officer with a reason and correction deadline.",
        body=dict(expectedRevision=4, comments="Hakiki idadi na urekebishe taarifa.", correctionDeadline="2026-10-30"),
        response={"data": dict(id=1, status="returned", revision=5, workflowStage="ministry", currentStep=None,
              correctionDeadline="2026-10-30", allowedActions=[])},
        rules="comments required max10000; correctionDeadline required YYYY-MM-DD, today or later in Africa/Dar_es_Salaam. Use current revision and a future date when testing. Returns to responsible officer, not previous reviewer. Officer GET shows save/submit while eligible; returning reviewer's response shows []. Correction may extend original deadline, but period and parent must remain open. Save corrections then POST submit; original pinned path restarts.")
    add(MODULES[1], "POST", "/submissions/{id}/publish", reviewer, "Complete the pending ministry publication step after approval.",
        body=dict(expectedRevision=6, comments="Taarifa zimeidhinishwa kuchapishwa."),
        response={"data": dict(id=1, status="published", revision=7, workflowStage="ministry", currentStep=None,
              publishedAt="2026-10-22T15:00:00+03:00", allowedActions=[])},
        rules="Example assumes uninterrupted path without return. Requires approved status and publish step. Records publishedAt; locks changes. Does not itself implement sector aggregates or a public dashboard. New institution workflows cannot publish; legacy null-stage submissions retain their original path.")
    return rows


def extend_reference(doc_path=None):
    doc_path = Path(doc_path or ROOT.parent / "Viwanda_Portal_Backend_API_Reference.docx")
    doc = Document(doc_path)
    records_path = ROOT / "documented-endpoints.json"
    existing = [r for r in json.loads(records_path.read_text(encoding="utf-8")) if r["module"] not in MODULES]
    new = endpoint_rows()
    # Replace only our extension on a repeat run; preserve original endpoint sections.
    deleting = False
    for element in list(doc._element.body):
        text = "".join(t.text or "" for t in element.iter(qn("w:t"))) if element.tag == qn("w:p") else ""
        if text == "Workflow configuration":
            deleting = True
        if text == "Testing sequence and implementation boundaries":
            deleting = False
        if deleting:
            doc._element.body.remove(element)
    anchor = next(p for p in doc.paragraphs if p.text == "Testing sequence and implementation boundaries")._p

    replacements = {
        "Implemented endpoints outside BE1": "Implemented endpoints outside BE1 | Base reference 20 October 2026 | Workflow and submission update 22 October 2026",
        "This reference documents": f"This reference contains {len(existing) + len(new)} HTTP method and path combinations for Postman testing and frontend integration. Rows 62-77 cover workflow configuration and submissions, including return for correction. The endpoint matrix uses S/N, ENDPOINT, ACCESS, DESCRIPTION, METHOD, HEADERS, RESPONSE/INPUT and STATUS.",
        "Scope excludes": "Scope includes workflow configuration and submissions in addition to the original non-BE1 modules. Other BE1 authentication, account activation, password reset, administration of institutions/departments/users/roles/permissions, portal settings, delegations, dashboard and search remain excluded. Framework health /up is not included.",
        "All non-public endpoints": "All non-public endpoints require a valid Sanctum bearer token and an active user. JSON requests use raw JSON and Content-Type: application/json. Field names are case-sensitive: submission input uses camelCase; workflow configuration uses snake_case step fields as shown in its tables.",
        "Example IDs come": "Example IDs come from the CBE and TANTRADE testing flows; replace them with current response IDs. Workflow examples use ministry version 1 and institution version 2; these are illustrative, not guaranteed IDs. Examples are not a seed script. Response examples show selected fields; omitted fields still appear in the actual response.",
        "Role abbreviations:": "Role abbreviations: MOA ministry administrator; IA Institutional Admin; IDO Institution Data Officer; DDO Department Data Officer; IHOD institutional head of department; AO institutional approving officer; MDO Ministry Data Officer; MDD ministry approving role. Workflow roles and actions follow configuration rather than a hardcoded sequence.",
        "5. Read the immutable": "5. Use the frozen template for the data-entry form. Follow the workflow and submission sequence above to save, submit, review, approve, return or publish data. Sector performance aggregation is separate from publishing a submission status.",
        "Initial priority is reserved": "Submission review, approval, correction and publication are exposed under /submissions. Dataset priority has its own rules; do not assume a workflow action changes priority automatically.",
        "Route inventory:": "Base route inventory: php artisan route:list --json --except-vendor. Workflow and submission additions were checked against routes/api.php, controllers, services and actor policies on 22 October 2026. Existing endpoint sections retain their original verification date. This documentation update does not execute API writes or change database records.",
        "Principal source files:": "Principal sources for the added routes: routes/api.php; WorkflowConfigurationController; SubmissionController; WorkflowConfigurationService; SubmissionService; ApprovalWorkflowService; WorkflowActorPolicy; SubmissionValueValidator; Submission model. Original sections also use their corresponding controllers, DTOs, services and resources.",
    }
    for p in doc.paragraphs:
        for prefix, value in replacements.items():
            if p.text.startswith(prefix):
                p.text = value
                break
    for s in doc.sections:
        for p in s.footer.paragraphs:
            for run in p.runs:
                if "20 October 2026" in run.text:
                    run.text = run.text.replace("20 October 2026", "Updated 22 October 2026")

    def paragraph(text, style=None):
        p = doc.add_paragraph(text, style)
        anchor.addprevious(p._p)
        return p

    template_table = doc.tables[-1]
    widths = [c.width for c in template_table.rows[0].cells]

    def table_for(module):
        paragraph(module, "Heading 1")
        tbl = deepcopy(template_table._tbl)
        for tr in list(tbl.findall(qn("w:tr")))[1:]:
            tbl.remove(tr)
        anchor.addprevious(tbl)
        from docx.table import Table
        return Table(tbl, doc._body)

    def append_row(table, number, row):
        tr = table.add_row()
        tr._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        texts = [str(number), row["path"], row["access"], row["desc"], row["method"], row["headers"], row["detail"], row["codes"].replace(" / ", "\n")]
        for i, (cell, text) in enumerate(zip(tr.cells, texts)):
            cell.width = widths[i]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if number % 2 == 0:
                shd = OxmlElement("w:shd")
                shd.set(qn("w:fill"), "F2F5F8")
                cell._tc.get_or_add_tcPr().append(shd)
            cell.text = text
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.05
                if i in (0, 4, 7):
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in p.runs:
                    run.font.name = "Calibri"
                    run.font.size = Pt(10)

    for module in MODULES:
        table = table_for(module)
        for i, row in enumerate(new, len(existing) + 1):
            if row["module"] == module:
                append_row(table, i, row)
        if module == MODULES[0]:
            paragraph("Workflow ownership and versions", "Heading 2")
            paragraph("W - MOA manages the shared global ministry workflow. IA requires approval_circle.manage.institution and manages only its own institution. List/create and step-update routes additionally require either approval_circle.manage.ministry or approval_circle.manage.institution. The service still enforces role and scope. No payload can choose another institution or department.")
            paragraph("Institution configuration example for IA", "Heading 2")
            paragraph("POST {{baseUrl}}/approval-circles with the following body. Save data.id and POST /approval-circles/{id}/activate with no body. The same name and complete steps array are required for PUT updates.")
            paragraph(json.dumps(dict(name="TANTRADE institutional approval", steps=[
                dict(step_name="Institution Review", required_role_code="IHOD", action="review", level="institution", can_return=True),
                dict(step_name="Institution Approval", required_role_code="AO", action="approve", level="institution", can_return=True),
            ]), indent=2))
            paragraph("The institution's final approval hands off to the first ministry step automatically. Example institution path: IDO -> IHOD review -> AO approve -> MDO review -> MDD approve -> publication. Department path: DDO -> MDO review -> MDD approve -> publication. These roles are examples; administrators configure the path.")
            paragraph("First submission pins the institution and ministry versions together. Later activation of a new workflow does not change in-flight submissions. Legacy submissions with workflowStage null preserve their original single-workflow path. New institution configurations cannot contain publish; cloning an old configuration removes that obsolete step from the new draft only.")
        else:
            paragraph("Submission access and response fields", "Heading 2")
            paragraph("S - Only the assigned active officer can create, edit and submit. MOA has administrative read access, IA reads its institution, and eligible configured reviewers read their scope. Ministry reviewers must belong to active MIT; department datasets also require matching department. For institution datasets, ministry visibility starts at handoff. Institution reviewers retain visibility afterward. Creator and assigned officer cannot review their own submission.")
            paragraph("Each submission response includes id, reference, reportingCalendarId, datasetId, reportingPeriodId, periodLabel, templateVersionId, workflowVersionId, ministryWorkflowVersionId, workflowStage, status, revision, attempt, currentStep, allowedActions, deadline, correctionDeadline, values, submittedAt and publishedAt. workflowStage is institution/ministry, or null before first submission and for legacy paths. Workflow IDs identify pinned configuration records; templateVersionId identifies the frozen form.")
            paragraph("currentStep uses snake_case fields: id, approval_circle_id, sequence, step_name, required_role_code, assigned_user_id, action, level, can_return and timestamps. allowedActions depends on the requesting user: the eligible officer sees save/submit, current reviewer sees the configured action plus return when enabled, and read-only users see []. Always refresh after a conflict or state change; the backend enforces authorization and deadlines independently of frontend buttons.")
            paragraph("Postman sequence and correction cycle", "Heading 2")
            paragraph("1. Activate the MOA ministry workflow and IA institution workflow. Use an active dataset and available global reporting period. TANTRADE example uses reportingCalendarId 9, datasetId 2, reportingPeriodId 46, templateVersionId 9 and indicatorId 12. Replace IDs if your response differs.")
            paragraph("2. Sign in as the calendar's responsible officer. POST /submissions with reportingCalendarId, then PUT /submissions/{id}/values. Each save replaces the full values array. Draft values may be incomplete; submit performs required-field validation. Dimension selections use [{\"dimensionId\":2,\"value\":4}] only when those IDs occur in that submission's frozen template; no dimensions uses [].")
            paragraph("3. For a fresh draft without extra writes: save expectedRevision 0 -> revision1; submit expectedRevision1 -> revision2; IHOD review expectedRevision2 -> revision3; AO approve expectedRevision3 -> revision4 and ministry handoff; MDO review expectedRevision4 -> revision5; MDD approve expectedRevision5 -> revision6; publish expectedRevision6 -> revision7. Read revision from every response instead of hardcoding these example numbers.")
            paragraph("4. At a pending step with can_return=true, the reviewer may POST /submissions/{id}/return with current expectedRevision, comments and correctionDeadline. Return is an action available on a step, not an extra workflow step with action=return. An in-app notification informs the assigned officer. GET shows the reason in history; status becomes returned and currentStep becomes null.")
            paragraph("5. The officer saves corrections and submits again before correctionDeadline. The correction deadline may be later than the original deadline, but period and annual parent must still be open. Resubmission increments attempt, records another immutable values version and restarts the original pinned path. Institution data repeats institution review before being released to ministry again.")
            paragraph("401 means authentication failure; 403 unauthorized actor or self-review; 404 missing/out-of-scope record; 409 stale revision, locked state, missing active workflow or no eligible next reviewer; 422 validation or closed/expired entry window. On revision409, GET the latest record and reconcile before retrying. Publish records status and publishedAt; sector aggregation and public dashboard delivery are separate features.")

    all_rows = existing + new
    # The retained dimension-create example is taller than one page in Word.
    # Permit this one row to continue instead of hiding the end of its JSON.
    for table in doc.tables:
        for row in table.rows[1:]:
            if row.cells[0].text == "44":
                props = row._tr.get_or_add_trPr()
                for flag in list(props.findall(qn("w:cantSplit"))):
                    props.remove(flag)
    # Word's built-in Title style can contain an inherited decorative rule.
    for p in doc.paragraphs:
        if p.style.name == "Title":
            for owner in (p._p.pPr, p.style.element.pPr):
                if owner is not None:
                    for border in list(owner.findall(qn("w:pBdr"))):
                        owner.remove(border)
    assert len(new) == 16
    assert len({(r["method"], r["path"]) for r in all_rows}) == len(all_rows)
    assert sum(len(t.rows) - 1 for t in doc.tables) == len(all_rows)
    doc.save(doc_path)
    records_path.write_text(json.dumps(all_rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(dict(output=str(doc_path), added=len(new), total=len(all_rows), modules=dict(Counter(r["module"] for r in new)))))


if __name__ == "__main__":
    extend_reference()
