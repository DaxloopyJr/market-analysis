/**
 * FILE: src/pages/DataEntry/DataEntry.jsx
 * NAVIGATION FLOW: /dashboard/data-entry and /dashboard/submissions/new -> ProtectedRoute -> RouteAccess -> DataEntry
 * DATA / API FLOW: Existing src/services/idoSubmissionService.jsx; future backend contracts documented there.
 * APPROVED WIZARD: Dataset -> Submission Method -> Data Entry -> Review -> Submit.
 * Periods come from verified /reporting-periods + dataset reporting-calendar;
 * Financial Year -> Dataset-supported Frequency -> eligible Period Cards.
 * Closed and upcoming periods remain visible but cannot be selected (backend MUST revalidate).
 * POST context/template, GET details/list, PUT values and POST final submit
 * are wired to their supplied Laravel paths. PUT values uses the confirmed
 * indicator/remarks/breakdowns body; GET read-back checks persistence before Submit.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "../../utils/portalAlerts";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
import {MuBadge, MuCard, MuHeader, MuKpi, MuRing} from "../../components/modern/ModernUI";
import {ownOrg} from "../../utils/roleDisplay";
import {directionOf,performanceOf} from "../../utils/annualTargets";
import {
  AlertCircle,
  Layers,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarClock,
  Clock3,
  Database,
  LockKeyhole,
  Check,
  CheckCircle2,
  ChevronDown,
  Search,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Info,
  Pencil,
  Save,
  Upload,
  LoaderCircle,
  Target,
} from "lucide-react";
import {periodOrderFromLabel, shortPeriodName, ytdForIndicator} from "../../utils/yearToDate";
import {useYearToDate} from "../../services/yearToDateService";
import {PerformanceBar} from "../../components/insights/TargetPerformance";
import {objectiveLabel, objectivePickerState} from "../../utils/annualObjective.js";
import {existingSubmissionState, lockedReportMessage, periodCardLabel, submissionsByPeriod} from "../../utils/periodSubmissions.js";
import {listSubmissionsPage} from "../../API/submission";
import {BudgetEntry, NotesEntry, PerformanceSummary} from "../../components/insights/BudgetPerformance.jsx";
import {budgetStatus, emptyPerformanceForm, hasPerformanceInput, parseMoney, performanceErrors, performanceForm, yearToDateBudget} from "../../utils/budgetPerformance.js";
import {annualTargetsWritable, formatTarget, isNumericIndicator, targetInputError, targetLocked} from "../../utils/annualTargets";
import {
  getAssignedDatasets,
  getDatasetIndicators,
  getDatasetDimensions,
  submissionWritesReady,
  getSubmissionById,
  getSubmissionPeriods,
  saveDraft,
  submitDraft,
  createSubmissionContext,
  createSubmissionTemplate,
  resolveReportingCalendarId,
} from "../../services/idoSubmissionService";
import "../Dashboard/Dashboard.css";
import "./DataEntry.css";
import { useToast } from "../../components/Toast/ToastProvider";
import {isEntryEligible, reportingYear, todayISO, periodState} from "../../utils/reportingPeriodRules";
import {configuredRemarkMode} from '../../utils/indicatorRemarks';
import {apiError} from "../../API/resourceHelpers";
import {showUserFacingError, userFacingErrorMessage} from "../../utils/userFacingErrors";
import {draftEditable, hasEnteredSubmissionValues, normalizeSubmissionRecord} from "../../utils/submissionValues";
import {categoriesForIndicator, validateHodIndicator} from "../../utils/hodReviewRules";
import {dimensionIndicatorIssues, dimensionsForIndicator} from "../../utils/dimensionValidation.js";
import {MuSkeleton} from "../../components/modern/ModernUI.jsx";
import {
  frequencyLabel,
  getConfiguredFrequencies,
  getEligibleFrequencyPeriods,
  getFrequencyPeriods,
  recommendPeriod,
  formattedReportingDate,
} from "../../utils/submissionFrequency";

/**
 * PAGE -> SERVICE -> FUTURE LARAVEL API (all examples, NOT confirmed)
 * DataEntry.jsx -> services/idoSubmissionService.jsx -> API/axios.jsx
 *
 * Step 1: getAssignedDatasets() -> VERIFIED GET /api/v1/datasets?status=active
 *         getSubmissionPeriods() -> VERIFIED GET /api/v1/reporting-periods (global)
 *                               + GET /api/v1/datasets/{id}/reporting-calendar.
 * Step 3: getDatasetIndicators() -> VERIFIED GET /api/v1/datasets/{id}/indicators.
 * Step 2: allowed_methods must come from the assigned dataset's API result.
 * Step 3: indicators come from documented /datasets/{id}/indicators; historical
 *         previous-values is intentionally NOT fetched until an API exists.
 * Draft TEMPLATE preparation is enabled by confirmed POST context + template.
 * PUT values and POST final submit are enabled with backend read-back checks.
 * The service includes exact TODO(BACKEND) examples; no 404 requests are sent.
 * Upload: documented Laravel multipart endpoint is still pending confirmation.
 * Expected JSON structures, request bodies, 401/403/409/422 error handling and
 * Laravel institution-scoping and Approval Circle routing are backend-authoritative.
 *
 * SECURITY: The frontend is not the authority for dataset, period,
 * field validation, institution scope, or approval-stage transitions.
 */

const STEPS = ["Dataset", "Submission Method", "Data Entry", "Review", "Submit"];
const shortPeriodLabel = period => {
  const label=String(period?.label||'');
  return label.match(/\bQ[1-4]\b/i)?.[0] || label.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b/i)?.[0] || label || 'Period';
};

function fieldIsEmpty(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function getFieldError(field, rawValue) {
  if (field.required && fieldIsEmpty(rawValue)) return `${field.label} is required.`;
  if (fieldIsEmpty(rawValue)) return "";
  const value = String(rawValue);

  if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${field.label} must be a valid number.`;
    if (field.min != null && number < field.min) return `Minimum allowed value: ${field.min}.`;
    if (field.max != null && number > field.max) return `Maximum allowed value: ${field.max}.`;
    if (field.precision === 0 && !Number.isInteger(number)) return `${field.label} must be a whole number.`;
    if (Number.isInteger(field.precision) && field.precision >= 0) {
      const places = value.split(".")[1]?.length || 0;
      if (places > field.precision) return `Use at most ${field.precision} decimal places.`;
    }
  }

  if (field.max_length != null && value.length > field.max_length) {
    return `Maximum ${field.max_length} characters.`;
  }
  if (field.type === "select" && !field.options?.some((option) => {
    const candidate = typeof option === "object" ? option.value : option;
    return String(candidate) === value;
  })) {
    return "Choose one of the configured options.";
  }
  return "";
}

function ValueInput({ indicator, value, onChange, error }) {
  const commonProps = {
    id: `indicator-${indicator.key}`,
    "aria-label": `Current value for ${indicator.label}`,
    "aria-invalid": Boolean(error),
    className: error ? "ido-indicator-input is-invalid" : "ido-indicator-input",
    value: value ?? "",
    onChange: (event) => onChange(indicator.key, event.target.value),
    required: Boolean(indicator.required),
  };

  if (indicator.type === "textarea") {
    return <textarea {...commonProps} rows={2} placeholder="Enter supporting notes..." />;
  }

  if (indicator.type === "select") {
    return (
      <select {...commonProps}>
        <option value="">Choose value...</option>
        {(indicator.options || []).map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    );
  }

  return (
    <input
      {...commonProps}
      type={indicator.type === "number" ? "number" : indicator.type === "date" ? "date" : "text"}
      min={indicator.type === "number" ? indicator.min : undefined}
      max={indicator.type === "number" ? indicator.max : undefined}
      step={indicator.type === "number" ? indicator.precision === 0 ? "1" : "any" : undefined}
      placeholder={indicator.type === "number" ? "Enter number" : "Enter value"}
    />
  );
}

function ProgressSteps({ currentStep }) {
  const allComplete = currentStep >= STEPS.length - 1;

  return (
    <nav className="ido-wizard-progress" aria-label="Submission progress">
      {STEPS.map((label, index) => {
        const complete = allComplete || index < currentStep;
        const active = !allComplete && index === currentStep;

        return (
          <div className="ido-progress-unit" key={label}>
            <div
              className={`ido-progress-item ${complete ? "completed" : ""} ${active ? "active" : ""}`}
              aria-current={active ? "step" : undefined}
              aria-label={`${label}: ${complete ? "completed" : active ? "current" : "upcoming"}`}
            >
              <span className="ido-progress-number">
                {complete ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : index + 1}
              </span>
              <span className="ido-progress-label">{label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={`ido-progress-connector ${complete ? "completed" : ""}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Step 1: annual strategic objective for the selected dataset + reporting year (approved mockup obj-*.png). */
function ObjectivePicker({mode, context, choice, chosen, onChoose, yearLabel, error, onRetry}) {
  const [open, setOpen] = useState(false);
  const year = yearLabel || 'this year';
  if (mode === 'loading') return <div className="ido-objective-section" role="status"><h3>Strategic Objective ({year})</h3><p>Loading objectives…</p></div>;
  if (mode === 'failed') return <div className="ido-objective-section"><h3>Strategic Objective ({year})</h3>
    <div className="ido-objective-note info" title={error || undefined}><Target size={16}/><span>The strategic objective for {year} is not available for this period right now. If it was already chosen this year, it stays the same and is applied automatically. {onRetry && <button type="button" className="ido-objective-retry" onClick={onRetry}>Refresh</button>}</span></div></div>;
  if (mode === 'missing') return <div className="ido-objective-section"><h3>Strategic Objective ({year})</h3>
    <div className="ido-objective-note info"><Target size={16}/> No strategic objective is set for this dataset and period, so none is required here.</div></div>;
  if (mode === 'no-plan') return <div className="ido-objective-section"><h3>Strategic Objective ({year})</h3>
    <div className="ido-objective-note warn"><AlertCircle size={16}/> No active strategic plan covers {year} for your institution, so no objective is required. Ask your Institutional Admin to create and activate one.</div></div>;
  if (mode === 'no-options') return <div className="ido-objective-section"><h3>Strategic Objective ({year})</h3>
    <div className="ido-objective-note warn"><AlertCircle size={16}/> The active strategic plan has no objective valid for {year}. Ask the plan owner to add one.</div></div>;
  const plan = (chosen || context?.available?.[0] || context?.selected)?.strategicPlanName;
  if (mode === 'locked') return <div className="ido-objective-section"><h3>Strategic Objective ({year})</h3><p>Already chosen for this dataset in {year}.</p>
    <div className="ido-objective-select is-locked" aria-label="Strategic objective (locked)">
      {chosen ? <><span className="ido-objective-code">{chosen.code || '—'}</span><span className="ido-objective-text">{chosen.description}</span></> : <span className="ido-objective-text">Locked</span>}
      <LockKeyhole size={16} className="ido-objective-chevron"/></div>
    <div className="ido-objective-meta">{plan && <span className="is-blue">{plan}</span>}{chosen?.versionNumber && <span>Version {chosen.versionNumber}</span>}<span className="is-green">Locked for {year}</span></div></div>;
  const pick = (item) => { onChoose(String(item.objectiveVersionId)); setOpen(false); };
  return <div className="ido-objective-section">
    <h3>Strategic Objective ({year}) {context?.requiresEntry !== false && <b>*</b>}</h3>
    <p>All indicators of this dataset will be analysed under the objective you choose for this year.</p>
    <div className="ido-objective-dropdown" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" className={`ido-objective-select ${open ? 'is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {chosen ? <><span className="ido-objective-code">{chosen.code || '—'}</span><span className="ido-objective-text">{chosen.description}</span></>
          : <span className="ido-objective-placeholder">Select objective…</span>}
        <span className="ido-objective-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <ul className="ido-objective-list" role="listbox" aria-label="Strategic objectives">
        {context.available.map(item => <li key={item.objectiveVersionId}>
          <button type="button" role="option" aria-selected={String(item.objectiveVersionId) === String(choice)} className={String(item.objectiveVersionId) === String(choice) ? 'is-active' : ''} onClick={() => pick(item)}>
            <span className="ido-objective-code">{item.code || '—'}</span>
            <span><b>{item.description}</b><small>{item.versionNumber ? `Version ${item.versionNumber}` : ''}{item.effectiveFrom ? ` · effective ${formattedReportingDate(item.effectiveFrom)}` : ''}</small></span>
          </button></li>)}
      </ul>}
    </div>
    {chosen && <div className="ido-objective-meta">{plan && <span className="is-blue">{plan}</span>}{chosen.versionNumber && <span>Version {chosen.versionNumber}{chosen.effectiveFrom ? ` · effective ${formattedReportingDate(chosen.effectiveFrom)}` : ''}</span>}
      <span className="is-amber">Draft · can be changed</span></div>}
    <div className="ido-objective-note info"><Target size={16}/> You can change it until the first submission for {year}. After that it is locked for the year and later periods reuse it.</div>
  </div>;
}

export default function DataEntry() {
  const { user } = useOutletContext();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get("edit");
  const [datasets, setDatasets] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [datasetId, setDatasetId] = useState("");
  const [datasetPickerOpen,setDatasetPickerOpen] = useState(false);
  const [datasetSearch,setDatasetSearch] = useState('');
  const [remarks,setRemarks] = useState({});
  const [dimensionValues,setDimensionValues] = useState({});
  const [dimensionDefinitions,setDimensionDefinitions] = useState([]);
  const [selectedDatasetIds,setSelectedDatasetIds] = useState([]);
  const [datasetWork,setDatasetWork] = useState({});
  // Live response IDs are held per dataset+period in memory only. A completed
  // template never implies that entered indicator values were persisted.
  const [preparedTemplates, setPreparedTemplates] = useState({});
  const [savedVersion, setSavedVersion] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [periodId, setPeriodId] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [reportingFrequency, setReportingFrequency] = useState("");
  const [periodLoading,setPeriodLoading] = useState(false);
  const [periodError,setPeriodError] = useState("");
  const [method, setMethod] = useState("manual");
  const [values, setValues] = useState({});
  const [visibleIndicators, setVisibleIndicators] = useState([]);
  const [previous, setPrevious] = useState({ values: {}, previous_period: "" });
  const [indicatorDefinitions, setIndicatorDefinitions] = useState([]);
  const [indicatorLoading, setIndicatorLoading] = useState(false);
  const [indicatorError, setIndicatorError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filename, setFilename] = useState("");
  const [recordId, setRecordId] = useState(editId || null);
  const [feedback, setFeedback] = useState("");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [touched, setTouched] = useState(false);
  // ANNUAL TARGETS: entered once per dataset + reporting year + numeric indicator.
  // targetContext = Laravel annualTargetContext (existing targets are locked).
  const [targetInputs, setTargetInputs] = useState({});
  const [targetContext, setTargetContext] = useState(null);
  const [recordStatus, setRecordStatus] = useState('');
  // ONE REPORT PER DATASET + PERIOD: existing submissions per dataset (GET /submissions?datasetId=…).
  const [existingByDataset, setExistingByDataset] = useState({});
  // ANNUAL STRATEGIC OBJECTIVE (29 Oct 2026): one per dataset + reporting year, chosen in step 1.
  // Keyed by "datasetId:periodId" -> {context (Laravel annualObjectiveContext), choice, loading}.
  const [objectiveByKey, setObjectiveByKey] = useState({});
  // Budget + implementation notes (step 3, under the indicators).
  const [perfForm, setPerfForm] = useState(emptyPerformanceForm);
  const [budgetContext, setBudgetContext] = useState(null);
  // Show request errors in a dismissible SweetAlert, never as a page-wide banner.
  // De-duplicate concurrent loading errors for the same selected dataset.
  const lastShownError = useRef('');
  useEffect(() => {
    const message = userFacingErrorMessage(error || periodError || indicatorError);
    if (!(error || periodError || indicatorError)) {
      lastShownError.current = '';
      return;
    }
    if (message === lastShownError.current) return;
    lastShownError.current = message;
    void showUserFacingError(message, 'Please check your submission');
  }, [error, periodError, indicatorError]);


  useEffect(() => {
    let live = true;

    async function initialize() {
      try {
        const [assigned, record] = await Promise.all([
          getAssignedDatasets(user),
          editId ? getSubmissionById(user, editId) : Promise.resolve(null),
        ]);
        if (!live) return;
        if (editId && !record) throw new Error("The requested submission was not found.");
        if (record && !draftEditable(record.status)) {
          throw new Error("Only Draft or Returned submissions may be edited.");
        }
        setDatasets(assigned);

        if (record) {
          if (!assigned.some((item) => String(item.id) === String(record.dataset_id))) {
            throw new Error("This dataset is no longer assigned to the current officer.");
          }
          setDatasetId(String(record.dataset_id));
          setSelectedDatasetIds([String(record.dataset_id)]);
          setPeriodId(String(record.period_id));
          setValues(record.values || {});
          setRemarks(record.remarks || {});
          setDimensionValues(record.dimensionValues || {});
          setSavedVersion(record.id);
          const recordPerf = performanceForm(record.performance);
          setPerfForm(recordPerf);
          setBudgetContext(record.annualBudgetContext || null);
          setSavedSnapshot(JSON.stringify({values:record.values||{},remarks:record.remarks||{},dimensionValues:record.dimensionValues||{}}) + (hasPerformanceInput(recordPerf) ? JSON.stringify(recordPerf) : ''));
          setFinancialYear(record.financialYear || '');
          setReportingFrequency(String(record.frequency || '').toLowerCase());
          setMethod(record.method || "manual");
          setFilename(record.filename || "");
          setRecordId(record.id);
          setRecordStatus(record.status || '');
          setTargetContext(record.annualTargetContext || null);
          setObjectiveByKey({[`${record.dataset_id}:${record.period_id}`]:{context:record.annualObjectiveContext||null,
            choice:String(record.annualObjectiveContext?.selected?.objectiveVersionId??''),loading:false}});
          if(record.id) setPreparedTemplates(current=>({...current,[`${record.dataset_id}:${record.period_id}`]:{templateId:record.id,created:true,status:record.status}}));
          setDatasetWork({[String(record.dataset_id)]:{
            periodId:String(record.period_id),financialYear:record.financialYear,reportingFrequency:record.frequency,
            method:record.method||'manual',values:record.values||{},remarks:record.remarks||{},dimensionValues:record.dimensionValues||{},
            perfForm:recordPerf,budgetContext:record.annualBudgetContext||null,
            filename:record.filename||'',recordId:record.id,serverStatus:'Saved Draft'
          }});
          setFeedback(record.status === "Returned" ? record.feedback : "");
        }
      } catch (failure) {
        if (live) setError(apiError(failure));
      } finally {
        if (live) setLoading(false);
      }
    }

    initialize();
    return () => { live = false; };
  }, [editId, user]);

  const dataset = useMemo(() => datasets.find((item) => String(item.id) === String(datasetId)), [datasets, datasetId]);
  useEffect(() => {
    let live = true;
    if (!dataset) {setPeriods([]);setPeriodId("");setFinancialYear("");setReportingFrequency("");return undefined;}
    setPeriodLoading(true);setPeriodError("");
    // Calendar is global. The officer-calendar assignment is NOT a gate for
    // period visibility or selection; Laravel controls actual write permissions.
    getSubmissionPeriods(user, dataset).then(assignedPeriods => {
      if (!live) return;
      const eligible = assignedPeriods.filter(isEntryEligible);
      const allowed = getConfiguredFrequencies(dataset, assignedPeriods);
      // For multiple frequencies recommend a current reporting window, not
      // simply the first configured frequency (which may have no open cards).
      // A previously selected valid period takes precedence when resuming.
      const currentPeriod = allowed.map(freq => eligible.find(p =>
        p.periodType === freq && p.startDate <= todayISO() && todayISO() <= p.endDate
      )).find(Boolean);
      const selectedId=datasetWork[String(dataset.id)]?.periodId || (editId ? periodId : '');
      const selected = assignedPeriods.find(p => String(p.id) === String(selectedId));
      const suggested = selected || currentPeriod || eligible[0] || assignedPeriods[0];
      const targetYear = (selected && reportingYear(selected)) || (editId && financialYear) || reportingYear(suggested) || "";
      const targetFrequency = (selected && selected.periodType) || (editId && reportingFrequency) ||
        (currentPeriod && currentPeriod.periodType) ||
        (suggested && suggested.periodType) || allowed[0] || "";
      const selectionIsValid = selected && reportingYear(selected) === targetYear &&
        selected.periodType === targetFrequency;
      const sameFrequency = getEligibleFrequencyPeriods(eligible, targetYear, targetFrequency);
      const recommendation = recommendPeriod(sameFrequency);
      setPeriods(assignedPeriods); // all quarters/months/annual states remain visible
      setFinancialYear(targetYear);
      setReportingFrequency(targetFrequency);
      setPeriodId(selectionIsValid ? String(selected.id) : (editId ? String(selectedId||'') : (recommendation ? String(recommendation.id) : "")));
    }).catch(failure => {
      if (!live) return;
      setPeriods([]);setPeriodId("");
      setPeriodError(apiError(failure));
    }).finally(() => {if(live)setPeriodLoading(false);});
    return () => {live = false;};
    // The dataset key changes on active dataset switch; saved work for that
    // dataset is read once, not on every keystroke in other wizard fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, user]);

  useEffect(() => {
    let live = true;
    setIndicatorDefinitions([]);
    setDimensionDefinitions([]);
    setIndicatorError('');
    setPrevious({values: {}, previous_period: ''});
    if (!datasetId) {setIndicatorLoading(false);return undefined;}
    setIndicatorLoading(true);
    Promise.allSettled([getDatasetIndicators(datasetId),getDatasetDimensions(datasetId)])
      .then(([indicatorResult,dimensionResult]) => {
        if (!live) return;
        if(indicatorResult.status==='rejected')setIndicatorError(apiError(indicatorResult.reason));
        else setIndicatorDefinitions(indicatorResult.value);
        if(dimensionResult.status==='fulfilled')setDimensionDefinitions(dimensionResult.value);
        // Dimensions are optional, never block the main indicator values form.
        // TODO(BACKEND): if the read is denied for IDO/DDO, expose scoped dimension read permission.
      })
      .finally(() => {if(live)setIndicatorLoading(false);});
    return () => {live = false;};
  }, [datasetId]);

  const supportedFrequencies = getConfiguredFrequencies(dataset, periods);
  const periodCards = getFrequencyPeriods(periods, financialYear, reportingFrequency);
  const period = periodCards.find((item) => String(item.id) === String(periodId));
  const periodEligible = Boolean(period && (editId ? true : isEntryEligible(period)));
  const pendingTargets = Object.fromEntries(Object.entries(targetInputs).filter(([,v])=>String(v??'').trim()!==''));
  const localSnapshot = JSON.stringify({values,remarks,dimensionValues}) + (hasPerformanceInput(perfForm) ? JSON.stringify(perfForm) : '') + (Object.keys(pendingTargets).length ? JSON.stringify(pendingTargets) : '');
  const targetsEditable = annualTargetsWritable(recordStatus);
  // YEAR-TO-DATE: earlier periods of this dataset/year/frequency (aggregation rule).
  const ytdFacts = useMemo(() => {
    if (!datasetId || !period) return null;
    const order = Number(period.periodNumber ?? period.period_number ?? period.quarter) || periodOrderFromLabel(period.label);
    return {id: recordId || null, datasetId, yearId: targetContext?.reportingYearId ?? null,
      yearLabel: targetContext?.yearLabel || financialYear, frequency: reportingFrequency || period.periodType || '',
      order: order || null, label: shortPeriodName(period.label)};
  }, [datasetId, period, recordId, targetContext, financialYear, reportingFrequency]);
  const ytdState = useYearToDate(ytdFacts);
  const hasUnsavedChanges = savedSnapshot !== localSnapshot;
  const templateKey = datasetId && periodId ? `${datasetId}:${periodId}` : '';
  const preparedTemplate = templateKey ? preparedTemplates[templateKey] : null;
  const objectiveState = templateKey ? objectiveByKey[templateKey] : null;
  const objectiveContext = objectiveState?.context ?? null;
  const objectiveChoice = objectiveState?.choice ?? '';
  const objectiveMode = objectiveState?.loading ? 'loading' : objectiveState?.failed ? 'failed'
    : objectiveState?.missing ? 'missing' : objectivePickerState(objectiveContext, recordStatus);
  const chosenObjective = objectiveContext?.available.find(item => String(item.objectiveVersionId) === String(objectiveChoice))
    || (objectiveContext?.selected && String(objectiveContext.selected.objectiveVersionId) === String(objectiveChoice) ? objectiveContext.selected : null)
    || (objectiveMode === 'locked' ? objectiveContext?.selected : null);
  const objectiveMissing = objectiveMode === 'select' && objectiveContext?.requiresEntry !== false && !chosenObjective;
  const setObjectiveChoice = (value) => templateKey && setObjectiveByKey(current => ({...current, [templateKey]: {...current[templateKey], choice: String(value || '')}}));
  // Load the objective choices as soon as an eligible period is picked (step 1). POST submission-context
  // only resolves the dataset's reporting calendar; it does not create a draft submission.
  // IMPORTANT: one request per dataset+period. The request is NOT cancelled when this effect re-runs
  // (setting the "loading" state re-runs it); cancelling there left the picker stuck on "Loading…".
  const objectiveRequests = useRef(new Set());
  /** Locked annual objective from this dataset's other reports in the same financial year (frozen snapshot). */
  async function lockedYearObjective() {
    const records = Object.values(existingByDataset[String(datasetId)]?.byPeriod ?? {})
      .filter(record => !financialYear || !record.financialYear || record.financialYear === financialYear)
      .sort((a, b) => (existingSubmissionState(a) === 'locked' ? 0 : 1) - (existingSubmissionState(b) === 'locked' ? 0 : 1));
    for (const record of records.slice(0, 3)) {
      try {
        const full = await getSubmissionById(user, record.id);
        const context = full?.annualObjectiveContext;
        if (context?.selected) return {...context, readOnly: true, available: []};
      } catch { /* try the next report of the year */ }
    }
    return null;
  }
  useEffect(() => {
    if (step !== 0 || !templateKey || !dataset || !period || !periodEligible || recordId) return;
    if (objectiveByKey[templateKey] || objectiveRequests.current.has(templateKey)) return;
    const key = templateKey;
    objectiveRequests.current.add(key);
    setObjectiveByKey(current => ({...current, [key]: {context: null, choice: '', loading: true}}));
    createSubmissionContext(Number(datasetId), {financialYear, frequency: reportingFrequency, period}).then(context => {
      if (context.reportingCalendarId) setPreparedTemplates(current => ({...current, [key]: {...current[key], reportingCalendarId: context.reportingCalendarId}}));
      if (context.annualTargetContext) setTargetContext(old => old || context.annualTargetContext);
      if (context.annualBudgetContext) setBudgetContext(old => old || context.annualBudgetContext);
      const objective = context.annualObjectiveContext || null;
      setObjectiveByKey(current => ({...current, [key]: {context: objective, choice: String(objective?.selected?.objectiveVersionId ?? ''), loading: false, missing: !objective}}));
    }).catch(async failure => {
      // The year's objective is locked after its first submission. If the context request is refused
      // (e.g. "Data tayari zimewasilishwa"), read the locked objective from another report of the SAME
      // dataset + year and show it read-only instead of an error.
      const locked = await lockedYearObjective();
      setObjectiveByKey(current => ({...current, [key]: locked
        ? {context: locked, choice: String(locked.selected?.objectiveVersionId ?? ''), loading: false}
        : {context: null, choice: '', loading: false, failed: true, error: userFacingErrorMessage(failure)}}));
    }).finally(() => { objectiveRequests.current.delete(key); });
    // lockedYearObjective reads the latest state when it runs; it must not re-trigger this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, templateKey, dataset, period, periodEligible, recordId, datasetId, financialYear, reportingFrequency, objectiveByKey]);
  // Read this dataset's submissions once so every period card shows Submitted / Draft saved / Returned.
  useEffect(() => {
    // Also read in edit mode: the budget section sums the year's other reports.
    if (!datasetId || existingByDataset[String(datasetId)]) return;
    const key = String(datasetId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExistingByDataset(current => ({...current, [key]: {loading: true, byPeriod: {}}}));
    listSubmissionsPage({datasetId: Number(datasetId), perPage: 100, page: 1}).then(result => {
      const records = result.items.map(normalizeSubmissionRecord).filter(row => String(row.dataset_id ?? key) === key);
      setExistingByDataset(current => ({...current, [key]: {loading: false, byPeriod: submissionsByPeriod(records)}}));
    }).catch(() => {
      // Not fatal: Laravel still refuses duplicates on save (handled with the same message).
      setExistingByDataset(current => ({...current, [key]: {loading: false, byPeriod: {}, failed: true}}));
    });
  }, [datasetId, existingByDataset]);
  const existingForPeriod = (id) => (editId ? null : existingByDataset[String(datasetId)]?.byPeriod?.[String(id)] ?? null);
  const selectedExisting = periodId ? existingForPeriod(periodId) : null;
  const selectedExistingState = existingSubmissionState(selectedExisting);
  function openExisting(record) {
    navigate(`/dashboard/submissions/new?edit=${encodeURIComponent(record.id)}`);
  }
  async function announceExisting(item, record) {
    const state = existingSubmissionState(record);
    const label = `${shortPeriodLabel(item)} ${reportingYear(item) || financialYear || ''}`.trim();
    if (state === 'locked') {
      const answer = await Swal.fire({icon: 'info', title: 'Report already submitted', text: lockedReportMessage(record, label, dataset?.name),
        showCancelButton: true, confirmButtonText: 'View submission', cancelButtonText: 'Close'});
      if (answer.isConfirmed) navigate(`/dashboard/submissions/my?detail=${encodeURIComponent(record.id)}`);
      return;
    }
    const returned = state === 'returned';
    const answer = await Swal.fire({icon: 'question', showCancelButton: true,
      title: returned ? 'Correct the returned report?' : 'Continue your saved draft?',
      text: returned
        ? `The ${label} report was returned for correction. Open it to correct and resubmit; a new report will not be created.`
        : `A draft for ${label} already exists (#${record.id}). Continue editing it; a second report will not be created.`,
      confirmButtonText: returned ? 'Open for correction' : 'Continue draft'});
    if (answer.isConfirmed) openExisting(record);
  }
  // The automatic period suggestion must never land on a period that already has a report.
  // Always clear it (the suggestion can re-select it after the submissions list loads); periods with
  // a report are only opened through announceExisting, never selected, so this cannot loop.
  useEffect(() => {
    if (!periodId || editId || recordId || !selectedExistingState) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodId('');
  }, [periodId, editId, recordId, selectedExistingState]);
  const retryObjectives = () => templateKey && setObjectiveByKey(current => { const next = {...current}; delete next[templateKey]; return next; });
  const financialYears = [...new Set(periods.map(reportingYear).filter(Boolean))].sort().reverse();
  const institutionName = user?.institution?.name || user?.department?.name || "Assigned workspace";
  const indicators = useMemo(() => [...indicatorDefinitions].map(i=>({
    ...i,remarksMode:configuredRemarkMode(i.raw || i,datasetId,i.key),
  })).sort((a, b) => (a.order || 0) - (b.order || 0)), [indicatorDefinitions,datasetId]);
  const invalidFields = useMemo(() => Object.fromEntries(
    indicators.flatMap(indicator => {
      const messages = [];
      // Optional annual target: only an entered, invalid NEW target blocks Continue.
      const targetError = targetLocked(targetContext,indicator.key,recordStatus) ? '' : targetInputError(targetInputs[indicator.key]);
      if (targetError) messages.push([`${indicator.key}.target`,`${indicator.label}: ${targetError}`]);
      if (indicator.remarksMode === 'required' && fieldIsEmpty(remarks[indicator.key]))
        messages.push([`${indicator.key}.remarks`,`${indicator.label}: remarks are required.`]);
      // VERIFICATION (27 Oct 2026): an indicator WITHOUT a dimension passes as entered.
      // Only indicators WITH dimensions are checked: value, required dimension entries and
      // additive breakdown totals (Gender and Role each add up separately to the total).
      messages.push(...dimensionIndicatorIssues({indicator,definitions:dimensionDefinitions,values,dimensionValues,
        fieldError:getFieldError(indicator, values[indicator.key])}));
      return messages;
    })
  ), [indicators, values, remarks, dimensionDefinitions, dimensionValues, targetInputs, targetContext, recordStatus]);
  const perfErrors = useMemo(() => performanceErrors(perfForm, budgetContext), [perfForm, budgetContext]);
  const perfErrorCount = Object.keys(perfErrors).length;
  const requiredMissing = Object.keys(invalidFields).length + (method === 'manual' ? perfErrorCount : 0);
  // Year-to-date budget: this dataset's other reports of the same year + this form.
  const budgetYtd = useMemo(() => yearToDateBudget(Object.values(existingByDataset[String(datasetId)]?.byPeriod ?? {}), {
    currentId: recordId, yearLabel: budgetContext?.yearLabel || targetContext?.yearLabel || '', financialYear,
    current: {received: parseMoney(perfForm.received), spent: parseMoney(perfForm.spent)}}),
  [existingByDataset, datasetId, recordId, budgetContext, targetContext, financialYear, perfForm]);
  const budgetNow = budgetStatus({received: budgetYtd?.received ?? null, spent: budgetYtd?.spent ?? null,
    approved: budgetContext?.approvedBudget ?? parseMoney(perfForm.approvedBudget)});
  // Approved split view: the left-hand checklist toggles the editable fields
  // on the right. Unchecked indicators remain faint; the backend still enforces
  // every mandatory value regardless of checklist visibility.
  useEffect(()=>{
    setVisibleIndicators(indicators.length?[String(indicators[0].key)]:[]);
  },[indicators]);
  // MODERN UI (approved 28 Oct 2026): read-only figures for the KPI strip, the
  // indicator list status and the Review checklist. Laravel stays the validator.
  const entered=key=>!fieldIsEmpty(values[key]);
  const targetOf=item=>isNumericIndicator(item)?(targetContext?.byIndicator?.[String(item.key)]||targetInputs[item.key]||''):'';
  const perfRows=indicators.map(item=>{
    const target=targetOf(item);
    const y=ytdForIndicator({indicator:item,current:values[item.key],ytdState,facts:ytdFacts});
    return {key:item.key,label:item.label,target,result:target?performanceOf(y.ytd??values[item.key],target,directionOf(item)):null};
  });
  const enteredCount=indicators.filter(item=>entered(item.key)).length;
  const requiredLeft=indicators.filter(item=>item.required&&!entered(item.key)).length;
  const withTarget=perfRows.filter(row=>row.target).length;
  const scored=perfRows.filter(row=>row.result);
  const avgPerf=scored.length?performanceOf(scored.reduce((a,row)=>a+row.result.percent,0)/scored.length,100):null;
  const breakdownKeys=Object.keys(invalidFields).filter(key=>key.includes('.dimension.'));
  const dimensionIndicators=indicators.filter(item=>dimensionsForIndicator(dimensionDefinitions,item.key).length).length;
  const belowHalf=scored.filter(row=>row.result.band==='under');
  const org=ownOrg(user);
  const kpiStrip=<div className="mu-kpis de-kpis">
    <MuKpi icon={<MuRing percent={indicators.length?enteredCount/indicators.length*100:0} text={`${enteredCount}/${indicators.length}`}/>} tone="blue"
      title="Values entered" value={`${enteredCount} of ${indicators.length}`} note={enteredCount===indicators.length&&indicators.length?'all indicators filled':'indicators filled'} arrow={false}/>
    {step===2
      ?<MuKpi icon={<AlertCircle size={18}/>} tone={requiredLeft?'amber':'green'} title="Required left" value={`${requiredLeft} indicator${requiredLeft===1?'':'s'}`} note={requiredLeft?'must be filled':'all required filled'} arrow={false}/>
      :<MuKpi icon={<Target size={18}/>} tone="indigo" title="With target" value={`${withTarget} indicator${withTarget===1?'':'s'}`} note="annual target set" arrow={false}/>}
    {step===2
      ?<MuKpi icon={<Target size={18}/>} tone="indigo" title="With target" value={`${withTarget} indicator${withTarget===1?'':'s'}`} note="annual target set" arrow={false}/>
      :<MuKpi icon={<MuRing percent={avgPerf?.percent??null} color={avgPerf?.band==='under'?'#d92d20':avgPerf?.band==='excellence'?'#1eb53a':'#e0b400'} text={avgPerf?`${Math.round(avgPerf.percent)}%`:'—'}/>}
        tone="amber" title="Avg achievement" value={avgPerf?`${avgPerf.rounded}% · ${avgPerf.label.replace(' Performance','')}`:'—'} note={avgPerf?'indicators with a target':'no target yet'} arrow={false}/>}
    <MuKpi icon={<Layers size={18}/>} tone={breakdownKeys.length?'red':'green'} title={step===2?'Breakdowns to check':'Breakdowns'}
      value={!dimensionIndicators?'None':breakdownKeys.length?`${breakdownKeys.length} to fix`:'All match'} note={dimensionIndicators?'dimension totals':'no breakdowns in this dataset'} arrow={false}/>
  </div>;
  // "Next indicator": show the indicator after the last one open on the right.
  const showNextIndicator=()=>{
    const last=indicators.reduce((at,item,index)=>visibleIndicators.includes(String(item.key))?index:at,-1);
    const next=indicators[(last+1)%indicators.length];
    if(next)setVisibleIndicators([String(next.key)]);
  };
  const selectIndicator=key=>setVisibleIndicators(current=>current.includes(String(key))
    ?current.filter(id=>id!==String(key)):[...current,String(key)]);

  // Multi-dataset selection is a frontend workspace: each dataset still has its
  // own Laravel draft/submission ID. NEVER pretend a batch transaction exists.
  function changeDataset(nextId) {
    const key=String(nextId||'');
    if (datasetId && key===String(datasetId)) return;
    if (datasetId) {
      const oldKey=String(datasetId);
      setDatasetWork(current=>({...current,[oldKey]:{
        ...current[oldKey],periodId,financialYear,reportingFrequency,method,values,remarks,dimensionValues,filename,selectedFile,recordId,feedback,savedSnapshot,
        targetInputs,targetContext,recordStatus,perfForm,budgetContext
      }}));
    }
    const target=datasetWork[key]||{};
    setDatasetId(key);
    setPeriodId(target.periodId||'');
    setSavedVersion(target.recordId||null);
    setFinancialYear(target.financialYear||'');
    setReportingFrequency(target.reportingFrequency||'');
    setPeriods([]);
    setPeriodError('');
    setValues(target.values||{});
    setRemarks(target.remarks||{});
    setDimensionValues(target.dimensionValues||{});
    setTargetInputs(target.targetInputs||{});
    setTargetContext(target.targetContext||null);
    setRecordStatus(target.recordStatus||'');
    setPerfForm(target.perfForm||emptyPerformanceForm());
    setBudgetContext(target.budgetContext||null);
    setPrevious({ values: {}, previous_period: '' });
    setSelectedFile(target.selectedFile||null);
    setFilename(target.filename||'');
    setRecordId(target.recordId||null);
    setFeedback(target.feedback||'');
    setSavedSnapshot(target.savedSnapshot||'');
    setMethod(target.method||'manual');
    setStep(0);
    setTouched(false);
    setError('');
  }
  function toggleDataset(id) {
    const key=String(id);
    if(editId)return; // correcting a specific returned submission is single-record.
    const next=selectedDatasetIds.includes(key)
      ?selectedDatasetIds.filter(value=>value!==key)
      :[...selectedDatasetIds,key];
    setSelectedDatasetIds(next);
    if(!next.includes(String(datasetId)))changeDataset(next[0]||'');
    else if(!datasetId && next.length)changeDataset(next[0]);
  }
  const otherPendingDatasetId=selectedDatasetIds.find(id=>id!==String(datasetId)&&datasetWork[id]?.serverStatus!=='Submitted');

  function changeMethod(nextMethod) {
    if (!dataset?.allowed_methods?.includes(nextMethod)) return;
    setMethod(nextMethod);
    setError("");
  }

  // A NEW period is a NEW blank submission; draft values never cross periods.
  function changePeriod(nextId) {
    if (String(nextId) === String(periodId) || editId || recordId) return;
    setPeriodId(String(nextId || ''));
    setValues({});setRemarks({});setDimensionValues({});
    setTargetInputs({});setTargetContext(null);setRecordStatus('');
    setPerfForm(emptyPerformanceForm());setBudgetContext(null);
    setSavedSnapshot('');setSavedVersion(null);setTouched(false);
    setFilename('');setSelectedFile(null);setPrevious({values:{},previous_period:''});
  }

  function changeField(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setTouched(true); // Immediately show inline total/dimension validation as the user types.
  }

  function validateCurrent() {
    if (!dataset || !periodEligible) return "Choose a dataset and a reporting period before its due date.";
    if (objectiveMissing) return `Choose the strategic objective for ${objectiveContext?.yearLabel || financialYear || 'this reporting year'} in step 1.`;
    if (!dataset.allowed_methods?.includes(method)) return "This submission method is not enabled for the dataset.";
    if (method === "upload") return filename ? "" : "Please select an approved template file.";
    const firstError = Object.values(invalidFields)[0];
    if (firstError) return firstError;
    const perfError = Object.entries(perfErrors)[0];
    if (perfError) return perfError[0] === 'achievements' || perfError[0] === 'challenges'
      ? `Implementation notes: ${perfError[1]}` : `Budget: ${perfError[1]}`;
    return "";
  }

  function goNext() {
    setError("");
    if (step === 0 && (!dataset || !periodEligible)) {
      setError("Choose a dataset and an eligible reporting period (not past the due date).");
      
      return;
    }
    if (step === 0 && selectedExistingState) {
      const item = periodCards.find(card => String(card.id) === String(periodId));
      if (item) void announceExisting(item, selectedExisting);
      return;
    }
    if (step === 0 && objectiveMissing) {
      setError(`Choose the strategic objective for ${objectiveContext?.yearLabel || financialYear || 'this reporting year'}.`);
      return;
    }
    if (step === 1 && !dataset.allowed_methods?.includes(method)) {
      setError("Choose an available submission method.");
      
      return;
    }
    if (step === 2) {
      if (!indicators.length && !indicatorLoading && !indicatorError) {setError("This dataset has no configured indicators yet.");return;}
      if (indicatorLoading) {setError("Indicators are still loading. Please try again shortly.");return;}
      if (indicatorError) {setError(indicatorError);return;}
      setTouched(true);
      const message = validateCurrent();
      if (message) {
        setError(message);
        const firstInvalid=Object.keys(invalidFields)[0]?.split('.')[0];
        if(firstInvalid)setVisibleIndicators(current=>current.includes(String(firstInvalid))?current:[...current,String(firstInvalid)]);
        
        return;
      }
    }
    if (step === 1) void prefetchTargetContext();
    setStep((current) => Math.min(current + 1, 3));
  }

  /** Before Data Entry: POST submission-context (no draft is created) so the
   * officer can see whether this year's annual targets already exist (locked)
   * or still need to be entered (first report of the year). Never blocks entry. */
  async function prefetchTargetContext() {
    if (recordId || targetContext || !dataset || !period || !periodEligible || !templateKey) return;
    try {
      const context=await createSubmissionContext(Number(datasetId),{financialYear,frequency:reportingFrequency,period});
      if (context.reportingCalendarId) setPreparedTemplates(current=>({...current,[templateKey]:{...current[templateKey],reportingCalendarId:context.reportingCalendarId}}));
      if (context.annualTargetContext) setTargetContext(context.annualTargetContext);
      if (context.annualBudgetContext) setBudgetContext(old => old || context.annualBudgetContext);
    } catch { /* Save Draft repeats the context request and shows any real error. */ }
  }

  /** Create a separate Laravel snapshot for every dataset+period.
   * If POST succeeds without ID, BLOCK retries: duplicate templates are unsafe.
   */
  async function ensureSubmissionInstance() {
    // WORKFLOW STEP 1: datasetId is selected from GET /datasets (numeric master ID).
    // WORKFLOW STEP 2: POST /datasets/{datasetId}/submission-context with
    // {startYear,frequency,periodNumber}; 3: extract reportingCalendarId;
    // 4: POST /submissions {reportingCalendarId}; 5: store distinct submission ID.
    // Subsequent PUT value / POST submit always use SUBMISSION ID, not dataset ID.
    if (recordId) return Number(recordId);
    if (preparedTemplate?.created && preparedTemplate?.templateId) return Number(preparedTemplate.templateId);
    if (preparedTemplate?.idMissing) throw new Error('The submission may already exist. Refresh My Submissions before retrying to avoid duplicates.');
    if (!dataset || !period || !periodEligible || !templateKey) throw new Error('Select an eligible dataset and reporting period first.');
    const selectedDatasetId=Number(datasetId);
    if (!Number.isSafeInteger(selectedDatasetId) || selectedDatasetId<=0 || String(dataset.id)!==String(datasetId)) {
      throw new Error('Please select the dataset again.');
    }
    // The context POST MUST use selectedDatasetId, never period.id or a cached
    // submission ID. A global reportingPeriodId is also NOT a reportingCalendarId.
    // Always create/resolve context FIRST for a new draft (the POST is scoped
    // by selectedDatasetId). Do not bypass it just because the global period's
    // calendar happens to have a pre-existing ID.
    let reportingCalendarId=preparedTemplate?.reportingCalendarId;
    if (!reportingCalendarId) {
      let context;
      try {context=await createSubmissionContext(selectedDatasetId,{financialYear,frequency:reportingFrequency,period});}
      catch (error) {
        // On duplicate context only, a read-only lookup may resolve the existing
        // calendar safely. Never swallow 401/403/404/422 errors.
        if (error?.cause?.response?.status!==409) throw error;
        const existing=await resolveReportingCalendarId(selectedDatasetId,period.id);
        if (!existing) throw error;
        context={reportingCalendarId:existing};
      }
      reportingCalendarId=context.reportingCalendarId;
      if (context.annualTargetContext) setTargetContext(context.annualTargetContext);
      if (context.annualBudgetContext) setBudgetContext(old => old || context.annualBudgetContext);
      if (!reportingCalendarId) {
        // If POST produced a calendar but omitted its ID, read the dataset-scoped
        // calendar and match by its reportingPeriodId (never by array position).
        try {reportingCalendarId=await resolveReportingCalendarId(selectedDatasetId,period.id);} catch { /* Error below remains actionable. */ }
      }
      setPreparedTemplates(current=>({...current,[templateKey]:{...current[templateKey],reportingCalendarId:reportingCalendarId||null,idMissing:!reportingCalendarId}}));
      if (!reportingCalendarId) throw new Error('This reporting period is not ready for submissions. Choose another period or contact the administrator.');
    }
    // Save context in state so a failed POST /submissions does not repeat context POST.
    // Only after receiving a calendar ID do we create the blank submission copy.
    const created=await createSubmissionTemplate(reportingCalendarId);
    setPreparedTemplates(current=>({...current,[templateKey]:{reportingCalendarId,templateId:created.id||null,created:!!created.id,idMissing:!created.id,status:created.status}}));
    if(!created.id) throw new Error('The submission could not be created. Refresh My Submissions before retrying.');
    if (created.status && !['draft','returned','returnedforcorrection'].includes(String(created.status).toLowerCase().replace(/[\s_-]/g,''))) {
      throw new Error(lockedReportMessage({id:created.id,status:created.status}, period ? `${shortPeriodLabel(period)} ${financialYear||''}`.trim() : '', dataset?.name));
    }
    setRecordId(created.id);
    setDatasetWork(current=>({...current,[String(datasetId)]:{...current[String(datasetId)],recordId:created.id,serverStatus:'Draft'}}));
    return Number(created.id);
  }
  async function persistDraft({quiet=false}={}) {
    if (busy) return null;
    setError('');
    if (method==='upload') {setError('File upload is not available yet. Please use manual data entry.');return null;}
    if (!dataset || !periodEligible) {setError('Choose an eligible dataset and period first.');return null;}
    setBusy(true);
    try {
      const id=await ensureSubmissionInstance();
      const saved=await saveDraft({id,values,remarks,dimensionValues,method,targetInputs,indicators,objectiveChoice,performanceInput:perfForm});
      if (saved.annualObjectiveContext && templateKey) setObjectiveByKey(current=>({...current,[templateKey]:{context:saved.annualObjectiveContext,
        choice:String(saved.annualObjectiveContext.selected?.objectiveVersionId??objectiveChoice??''),loading:false}}));
      // Saved targets now come back in annualTargetContext and become read-only.
      if (saved.annualTargetContext) setTargetContext(saved.annualTargetContext);
      if (saved.status) setRecordStatus(saved.status);
      if (saved.sentTargets?.length) setTargetInputs({});
      setSavedSnapshot(JSON.stringify({values,remarks,dimensionValues}) + (hasPerformanceInput(perfForm) ? JSON.stringify(perfForm) : ''));
      if (saved.annualBudgetContext) setBudgetContext(saved.annualBudgetContext);
      setSavedVersion(id);
      setDatasetWork(current=>({...current,[String(datasetId)]:{...current[String(datasetId)],recordId:id,serverStatus:'Draft'}}));
      // A new blank draft is already persisted after POST /submissions;
      // value-level confirmation is shown only after PUT + GET read-back.
      if(!quiet)showToast(saved.draftOnly
        ? {type:'success',title:'Draft created',message:`Submission #${id} was created as Draft. No indicator values have been entered yet.`}
        : {type:'success',title:'Draft saved',message:`Draft #${id} saved. You can continue editing later.`});
      return saved;
    }catch(failure){
      const message=userFacingErrorMessage(failure);setError(message);
      return null;
    }finally{setBusy(false);}
  }
  async function submitForReview() {
    // Submit must never fail silently. Previous code referenced
    // hasEnteredSubmissionValues without importing it (ReferenceError on click).
    // Do not disable the action for invalid period/method: explain the blocker.
    if (busy) return;
    setError('');setTouched(true);
    if (!submissionWritesReady) {
      const message='Submission saving is not available. Please contact the portal administrator.';
      setError(message);
      return;
    }
    if (method !== 'manual') {
      const message='This submission method is not available yet. Choose manual data entry.';
      setError(message);
      return;
    }
    if (!dataset || !period || !periodEligible) {
      const message='The dataset or reporting period is not eligible for submission. Check the selected period and its deadline.';
      setError(message);
      return;
    }
    if (indicatorLoading || indicatorError) {
      const message=indicatorError || 'Indicators are still loading. Please try again after they load.';
      setError(message);
      return;
    }
    const message=validateCurrent();
    if(message){setError(message);return;}
    if (!hasEnteredSubmissionValues({values, remarks, dimensionValues})) {
      const warning = 'Enter indicator values before submitting. An empty submission instance cannot be sent for approval.';
      setError(warning);
      return;
    }
    const confirmation=await Swal.fire({
      title:'Submit for approval?',
      text:'Your information will be submitted for review. You cannot edit it unless it is returned for correction.',
      icon:'question',showCancelButton:true,confirmButtonText:'Submit for Review'
    });
    if(!confirmation.isConfirmed)return;
    // IMPORTANT SUBMIT CONTRACT (Laravel):
    // 1. ALWAYS PUT /submissions/{id}/values with
    //    {expectedRevision, values:[{indicatorId,value,remarks,breakdowns:[]}]},
    //    EVEN IF THE LOCAL FORM THINKS IT WAS SAVED EARLIER.
    // 2. GET /submissions/{id} must confirm those exact values.
    // 3. POST /submissions/{id}/submit sends ONLY {expectedRevision} fetched
    //    AFTER the PUT. That request changes status/routes the SAME submission
    //    ID through the configured Approval Circle; it does not carry values.
    // Never skip step 1 on the basis of savedVersion/hasUnsavedChanges.
    const saved=await persistDraft({quiet:true});
    if(!saved)return;
    if(saved.draftOnly){
      const warning='No indicator values have been entered yet. Please enter values before submitting.';
      setError(warning);
      return;
    }
    const id=Number(saved.id);
    setBusy(true);
    try{
      const result=await submitDraft(id);
      setDatasetWork(current=>({...current,[String(datasetId)]:{...current[String(datasetId)],recordId:id,serverStatus:result.status}}));
      setStep(4);
      showToast({type:'success',title:'Submitted for approval',message:`Submission #${id} has been sent for review.`});
    }catch(failure){const message=userFacingErrorMessage(failure);setError(message);}
    finally{setBusy(false);}
  }

  if (loading) return <section className="ido-page ido-wizard-loading"><MuSkeleton kind="list" rows={6} label="Loading available datasets…"/></section>;

  // Back / Save Draft / Continue or Submit. Steps 0–2 show it under the form; on Review it sits in the checklist card.
  const wizardActions = (
            <div className="ido-wizard-actions">
              <div>
                {step > 0 ? (
                  <button type="button" className="btn ido-outline-button" onClick={() => {
                    setStep((current) => current - 1);
                    setError("");
                                  }}><ArrowLeft size={16}/> Back</button>
                ) : (
                  <Link to="/dashboard/submissions/my" className="btn ido-outline-button">Cancel</Link>
                )}
              </div>
              <div className="ido-wizard-action-right">
                <button type="button" className="btn ido-secondary-button"
                  disabled={!submissionWritesReady || busy || !datasetId || !periodEligible || method!=='manual'}
                  title="Save your work as a draft"
                  onClick={()=>persistDraft()}>
                  {busy ? <LoaderCircle size={16} className="ido-button-spinner"/>:<Save size={16}/>}
                  {busy?'Saving...':'Save Draft'}
                </button>
                {step===2&&method==='manual'&&indicators.length>1&&<button type="button" className="btn ido-outline-button" onClick={showNextIndicator}>Next indicator <ArrowRight size={15}/></button>}
                {step < 3 ? (
                  <button type="button" className="btn ido-primary-button" disabled={busy || (step===0 && (periodLoading || !periodEligible))} onClick={goNext}>Continue <ArrowRight size={17}/></button>
                ) : (
                  <button type="button" disabled={busy}
                    onClick={submitForReview}
                    title={busy ? 'Submission in progress' : 'Submit for review'}
                    className="btn ido-primary-button">
                    {busy ? 'Processing...' : 'Submit for Review'} <ChevronRight size={17}/>
                  </button>
                )}
              </div>
            </div>
  );

  return (
    <div className="ido-page ido-data-entry-page de-modern container-fluid px-0">
      <MuHeader logo={org.logo} initials={org.initials||'IDO'} title={editId ? "Edit Draft / Correction" : "New Submission"}
        chips={step===0&&!editId
          ?[{label:'Institution',value:org.code||institutionName},{label:'Officer',value:user?.name},{label:'Datasets',value:datasets.length}]
          :[{label:'Dataset',value:dataset?.name},{label:'Period',value:period?`${shortPeriodLabel(period)} · ${financialYear}`:''},
            {label:'Due',value:period?.assignmentDeadline?formattedReportingDate(period.assignmentDeadline):''},
            {label:'Submission',value:recordId?`#${recordId}`:''}]}>
        {step!==4&&<span className="de-save-state">{recordId?(savedVersion&&!hasUnsavedChanges?<MuBadge tone="green">Draft saved</MuBadge>:<MuBadge tone="amber">Unsaved changes</MuBadge>):<MuBadge tone="amber">Draft</MuBadge>}</span>}
        <Link to="/dashboard/submissions/my" className="mu-btn de-back-link"><ArrowLeft size={15}/> My Submissions</Link>
      </MuHeader>

      <ProgressSteps currentStep={step} />

      <div className={`ido-wizard-columns ${step===0?'ido-step-one-page':''}`}>
        <section className="ido-wizard-panel" aria-label="Data submission form">
          <div className="ido-wizard-body">
            {feedback && step !== 4 && (
              <div className="ido-wizard-feedback" role="note">
                <Info size={18} />
                <div><strong>Returned by reviewer — action required</strong><p>{feedback}</p></div>
              </div>
            )}
            
            

            {step === 0 && (
              <div className="ido-period-step ido-approved-step-one">
                <div className="ido-step-heading"><h2><span className="ido-heading-number">1</span>Select Dataset and Reporting Period</h2>
                  <p>Choose a dataset, financial year, reporting frequency and reporting period to submit data for.</p>
                </div>
                <div className="ido-approved-period-layout">
                  <div className="ido-approved-main-card">
                    <div className="ido-form-field ido-field-wide ido-picker-wrap">
                      <label>Available Datasets <b>*</b></label>
                      <small>Choose one or more datasets; each uses its own reporting period.</small>
                      <button type="button" className={`ido-dataset-picker-toggle ${datasetPickerOpen?'is-open':''}`} aria-expanded={datasetPickerOpen}
                        onClick={()=>setDatasetPickerOpen(v=>!v)}>
                        <span className="ido-dataset-picker-chips">
                          {selectedDatasetIds.map(key=>{const item=datasets.find(d=>String(d.id)===key);return item?<span key={key} className="ido-dataset-chip">
                            {item.name}<span role="button" tabIndex={0} title={`Remove ${item.name}`} onClick={event=>{event.stopPropagation();toggleDataset(key);}} onKeyDown={event=>{if(event.key==='Enter'){event.stopPropagation();toggleDataset(key);}}}>×</span>
                          </span>:null;})}
                          {!selectedDatasetIds.length&&<span className="ido-dataset-placeholder">Select datasets...</span>}
                        </span><ChevronDown size={17}/>
                      </button>
                      {datasetPickerOpen&&<div className="ido-dataset-picker-menu">
                        <div className="ido-dataset-picker-search"><Search size={16}/><input type="search" aria-label="Search available datasets" placeholder="Search datasets..." value={datasetSearch} onChange={e=>setDatasetSearch(e.target.value)}/></div>
                        <div className="ido-dataset-picker-list">
                          {datasets.filter(item=>`${item.name} ${item.description||''}`.toLowerCase().includes(datasetSearch.toLowerCase())).map(item=>{
                            const key=String(item.id),checked=selectedDatasetIds.includes(key);
                            return <label key={key} className={`ido-dataset-picker-item ${checked?'is-selected':''}`}>
                              <input type="checkbox" disabled={Boolean(editId)} checked={checked} onChange={()=>toggleDataset(key)}/>
                              <span><strong>{item.name}</strong><small>{item.description||'Available dataset'}{datasetWork[key]?.serverStatus&&` · ${datasetWork[key].serverStatus}`}</small></span>
                            </label>;
                          })}
                          {!datasets.length&&<p className="ido-period-empty">No active datasets available to your account.</p>}
                          {!!datasets.length&&!datasets.some(item=>`${item.name} ${item.description||''}`.toLowerCase().includes(datasetSearch.toLowerCase()))&&<p className="ido-period-empty">No datasets match your search.</p>}
                        </div>
                        <button type="button" className="btn btn-outline-primary btn-sm ido-picker-done" onClick={()=>setDatasetPickerOpen(false)}>Done</button>
                      </div>}
                    </div>
                    {selectedDatasetIds.length>1&&<small className="ido-dataset-scope-note">Choose a reporting period and enter values separately for each selected dataset.</small>}
                    <div className="ido-two-inputs ido-approved-filter-row">
                      <div className="ido-form-field"><label htmlFor="ido-dataset">Currently Working On <b>*</b></label>
                        <select id="ido-dataset" value={datasetId} disabled={Boolean(editId)||!selectedDatasetIds.length} onChange={e=>changeDataset(e.target.value)}>
                          <option value="">Select a checked dataset...</option>
                          {datasets.filter(d=>selectedDatasetIds.includes(String(d.id))).map(d=><option value={d.id} key={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div className="ido-form-field"><label htmlFor="ido-financial-year">Financial Year <b>*</b></label>
                        <select id="ido-financial-year" disabled={!!recordId || !!editId || !datasetId||periodLoading||!financialYears.length} value={financialYear} onChange={e=>{
                          const next=e.target.value;setFinancialYear(next);
                          const match=recommendPeriod(getEligibleFrequencyPeriods(periods,next,reportingFrequency));changePeriod(match?String(match.id):'');
                        }}><option value="">Select financial year...</option>{financialYears.map(year=><option key={year} value={year}>{year}</option>)}</select>
                      </div>
                    </div>
                    <div className="ido-frequency-section">
                      <div className="ido-period-section-heading"><h3>Reporting Frequency <b>*</b></h3></div>
                      <div className="ido-frequency-options" role="group" aria-label="Reporting frequency">
                        {['monthly','quarterly','annual'].map(freq=>{
                          const enabled=supportedFrequencies.includes(freq);
                          return <button key={freq} type="button" className={`ido-frequency-choice ${reportingFrequency===freq?'is-selected':''}`} aria-pressed={reportingFrequency===freq}
                            disabled={!!recordId || !!editId || !enabled||periodLoading} title={!enabled?'Not enabled for the selected dataset':undefined} onClick={()=>{
                              if(freq===reportingFrequency)return;
                              setReportingFrequency(freq);
                              const match=recommendPeriod(getEligibleFrequencyPeriods(periods,financialYear,freq));changePeriod(match?String(match.id):'');
                            }}>{frequencyLabel(freq)}</button>;
                        })}
                      </div>
                      <small className="ido-frequency-help">Only frequencies configured for this dataset can be selected.</small>
                    </div>
                    <div className="ido-period-list-section">
                      <div className="ido-period-section-heading"><div><h3>Available Reporting Periods {financialYear&&`(${financialYear})`}</h3>
                        <p>Select an open reporting period. Closed and upcoming periods are shown for clarity.</p></div></div>
                      {periodLoading&&<div className="ido-period-empty" role="status">Loading reporting periods...</div>}
                      
                      {!periodLoading&&!periodError&&!periodCards.length&&<div className="ido-period-empty">{!datasetId?'Select a dataset to see its reporting periods.':'No periods are configured for this frequency and financial year.'}</div>}
                      {!!periodCards.length&&<div className="ido-period-card-grid" role="radiogroup" aria-label="Reporting periods">
                        {periodCards.map(item=>{
                          const active=String(item.id)===String(periodId);
                          const state=periodState(item);
                          const open=state==='available';
                          // One report per period: an existing submission decides what the card does.
                          const existing=existingForPeriod(item.id);
                          const existingState=existingSubmissionState(existing);
                          const status=existingState?periodCardLabel(existingState):open?'Open':state==='upcoming'?'Upcoming':state==='unavailable'?'Unavailable':'Closed';
                          const clickable=existingState?(!recordId&&!editId):open&&!recordId&&!editId;
                          return <button type="button" role="radio" aria-checked={active} key={item.id}
                            className={`ido-period-card ${active?'is-selected':''} is-${existingState?`existing-${existingState}`:status.toLowerCase()}`}
                            disabled={!clickable} title={existingState==='locked'?'Already submitted — cannot be written again':existingState?'A report already exists for this period':undefined}
                            onClick={()=>existingState?void announceExisting(item,existing):changePeriod(String(item.id))}>
                            <span className="ido-period-card-head"><strong>{shortPeriodLabel(item)}</strong><span className="ido-period-card-status">{existingState==='locked'&&<LockKeyhole size={11}/>}{status}</span></span>
                            <span className="ido-period-card-dates">{formattedReportingDate(item.startDate)} – {formattedReportingDate(item.endDate)}</span>
                            {existing&&<span className="ido-period-card-ref">{existing.raw?.reference||`#${existing.id}`}</span>}
                            <span className="ido-period-card-choice">{active?<CheckCircle2 size={16}/>:existingState==='locked'?<LockKeyhole size={15}/>:<span className="ido-period-radio"/>}</span>
                          </button>;
                        })}
                      </div>}
                    </div>
                    {period && periodEligible && objectiveMode !== 'unknown' && <ObjectivePicker mode={objectiveMode} context={objectiveContext}
                      choice={objectiveChoice} chosen={chosenObjective} onChoose={setObjectiveChoice} yearLabel={objectiveContext?.yearLabel || financialYear}
                      error={objectiveState?.error} onRetry={retryObjectives}/>}
                  </div>
                  <div className="de-side"><aside className="ido-approved-summary" aria-label="Selected Information">
                    <div className="ido-approved-summary-head"><h3><Database size={18}/> Selected Information</h3>
                      {period&&<span className="ido-summary-open">Open</span>}</div>
                    <div className="ido-approved-selected-name"><Database size={22}/><div><strong>{dataset?.name||'Select a dataset'}</strong>
                      <small>{dataset?.description||'Dataset description'}</small></div></div>
                    <dl className="ido-approved-summary-details">
                      <div><CalendarDays size={20}/><span>Financial Year<strong>{financialYear||'—'}</strong></span></div>
                      <div><CalendarClock size={20}/><span>Frequency<strong>{reportingFrequency?frequencyLabel(reportingFrequency):'—'}</strong></span></div>
                      <div><ClipboardList size={20}/><span>Selected Period<strong>{period?shortPeriodLabel(period):'Not selected'}</strong></span></div>
                      <div><CalendarDays size={20}/><span>Reporting Dates<strong>{period?`${formattedReportingDate(period.startDate)} – ${formattedReportingDate(period.endDate)}`:'—'}</strong></span></div>
                      <div><Clock3 size={20}/><span>Due Date<strong>{period?formattedReportingDate(period.assignmentDeadline):'—'}</strong></span></div>
                      {period&&<div><Target size={20}/><span>Strategic Objective<strong>{objectiveMode==='loading'?'Loading…'
                        :chosenObjective?objectiveLabel(chosenObjective):objectiveMode==='no-plan'?'Not required':objectiveMode==='select'?'Not selected':'—'}</strong></span></div>}
                    </dl>
                  </aside>
                  {datasetId&&indicators.length>0&&<MuCard title="Indicators in this dataset" count={indicators.length} className="de-indicator-card">
                    {indicators.map(item=><div className="de-ind-row" key={item.key}><span className={`de-dot ${item.required?'is-req':''}`}/>{item.label}
                      <b className={item.required?'':'is-opt'}>{item.required?'Required':'Optional'}</b></div>)}
                  </MuCard>}</div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <div className="ido-step-heading">
                  <h2>Choose submission method</h2>
                </div>

                <div className="ido-submission-methods" role="group" aria-label="Submission method">
                  <button
                    type="button"
                    disabled={!dataset?.allowed_methods?.includes("manual")}
                    className={`ido-submission-method ${method === "manual" ? "selected" : ""}`}
                    aria-pressed={method === "manual"}
                    onClick={() => changeMethod("manual")}
                  >
                    <span className="ido-method-icon"><Pencil size={20}/></span>
                    <span className="ido-method-copy"><strong>Manual data entry</strong><small>Enter indicator values manually.</small></span>
                    <span className="ido-method-check">{method === "manual" && <Check size={14}/>}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!dataset?.allowed_methods?.includes("upload")}
                    className={`ido-submission-method ${method === "upload" ? "selected" : ""}`}
                    aria-pressed={method === "upload"}
                    onClick={() => changeMethod("upload")}
                  >
                    <span className="ido-method-icon"><Upload size={20}/></span>
                    <span className="ido-method-copy"><strong>Upload approved template</strong><small>Upload an approved template file.</small></span>
                    <span className="ido-method-check">{method === "upload" && <Check size={14}/>}</span>
                  </button>
                </div>

              </div>
            )}

            {step === 2 && (
              <div>
                <div className="ido-step-heading">
                  <h2>{method === "manual" ? "Enter dataset values" : "Upload approved dataset template"}</h2>
                </div>

                {method === "manual" ? (
                  <>
                    {kpiStrip}

                    <div className="ido-indicator-split">
                      <div className="ido-indicator-picker" role="group" aria-label="Select indicators to edit">
                        <h3>Indicators <small>({indicators.length})</small></h3>
                        {indicators.map(indicator=><label key={indicator.id||indicator.key}
                          className={`ido-picker-row ${visibleIndicators.includes(String(indicator.key))?'is-checked':'is-faded'}`}>
                          <input type="checkbox" checked={visibleIndicators.includes(String(indicator.key))}
                            onChange={()=>selectIndicator(indicator.key)} aria-label={`Show ${indicator.label} input`}/>
                          {(()=>{const done=entered(indicator.key),target=targetOf(indicator);
                            return <><span className={`de-ind-state ${done?'is-done':indicator.required?'is-req':''}`} aria-label={done?'Entered':indicator.required?'Required':'Optional'}>
                              {done?<Check size={13} strokeWidth={3}/>:indicators.indexOf(indicator)+1}</span>
                            <span>{indicator.label}{indicator.required&&<b> *</b>}
                              <small>{done?`${values[indicator.key]}${target?` · target ${formatTarget(target)}`:''}`:[indicator.required?'required':'optional',indicator.unit].filter(Boolean).join(' · ')}</small>
                            </span></>;})()}
                        </label>)}
                        {indicatorLoading && <p role="status">Loading indicators...</p>}
                        
                        {!indicatorLoading && !indicatorError && !indicators.length && <p>No indicators are configured for this dataset.</p>}
                      </div>
                      <div className="ido-indicator-editor">
                        <h3>Indicator Values</h3>
                        {!visibleIndicators.length&&<p className="ido-editor-empty">Tick an indicator on the left to enter its value.</p>}
                        {indicators.filter(indicator=>visibleIndicators.includes(String(indicator.key))).map(indicator=>{
                          const fieldError=touched?invalidFields[indicator.key]:'';
                          return <div className="ido-indicator-edit-card" key={indicator.id||indicator.key}>
                            <h4>{indicator.label}{indicator.required&&<b className="ido-required-mark"> *</b>}</h4>
                            {indicator.description&&<p>{indicator.description}</p>}
                            <div className="ido-two-inputs">
                              <div className="ido-form-field"><label>Previous Value (read-only)</label><div className="ido-previous-value">{previous.values?.[indicator.key]??'—'}</div></div>
                              <div className="ido-form-field"><label htmlFor={`indicator-${indicator.key}`}>Current Value {indicator.unit&&`(${indicator.unit})`}</label><ValueInput indicator={indicator} value={values[indicator.key]} onChange={changeField} error={fieldError}/>{fieldError&&<small className="ido-indicator-error">{fieldError}</small>}</div>
                            </div>
                            {isNumericIndicator(indicator)&&(()=>{
                              const existing=targetContext?.byIndicator?.[String(indicator.key)];
                              const locked=Boolean(existing)||!targetsEditable;
                              const yearLabel=targetContext?.yearLabel||financialYear;
                              const shownTarget=existing||targetInputs[indicator.key];
                              const targetError=touched?invalidFields[`${indicator.key}.target`]:'';
                              return <div className={`ido-target-field ${locked?'is-locked':''}`}>
                                <div className="ido-target-row">
                                  <div className="ido-form-field">
                                    <label htmlFor={`target-${indicator.key}`}><Target size={15}/> Annual Target {yearLabel&&`(${yearLabel})`}</label>
                                    {locked
                                      ?<div className="ido-target-locked" aria-label={`Annual target for ${indicator.label}`}><LockKeyhole size={15}/>{existing?formatTarget(existing):'Not set'}{existing&&indicator.unit?` ${indicator.unit}`:''}</div>
                                      :<input id={`target-${indicator.key}`} className={`ido-indicator-input ${targetError?'is-invalid':''}`} type="number" min="0" step="any"
                                        value={targetInputs[indicator.key]??''} placeholder="Full-year target (optional)"
                                        onChange={e=>{setTargetInputs(current=>({...current,[indicator.key]:e.target.value}));setTouched(true);}}/>}
                                    {targetError&&<small className="ido-indicator-error">{targetError.split(': ').slice(1).join(': ')}</small>}
                                    <small className="ido-target-hint">{existing?'Locked for this reporting year.':!targetsEditable?'Targets cannot change on a returned submission.':'Entered once for the whole year; locked after saving.'}</small>
                                  </div>
                                  {(()=>{const y=ytdForIndicator({indicator,current:values[indicator.key],ytdState,facts:ytdFacts});
                                    return <PerformanceBar actual={y.ytd??values[indicator.key]} target={shownTarget} basis={y.text} direction={directionOf(indicator)}/>;})()}
                                </div>
                              </div>;
                            })()}
                            {indicator.remarksMode!=='hidden'&&<div className="ido-form-field ido-remarks-field">
                              <label htmlFor={`remark-${indicator.key}`}>Remarks {indicator.remarksMode==='required'&&<b>*</b>}</label>
                              <textarea id={`remark-${indicator.key}`} rows={2} value={remarks[indicator.key]||''}
                                aria-label={`Remarks for ${indicator.label}`} placeholder="Enter explanations or supporting comments..."
                                onChange={e=>setRemarks(current=>({...current,[indicator.key]:e.target.value}))}/>
                              {touched&&invalidFields[`${indicator.key}.remarks`]&&<small className="ido-indicator-error">{invalidFields[`${indicator.key}.remarks`]}</small>}
                            </div>}
                            {dimensionsForIndicator(dimensionDefinitions,indicator.key).map(dim=>{
                              const key=String(dim.dimensionId||dim.dimension_id||dim.dimension?.id), options=dim.dimension?.options||dim.options||[];
                              return <fieldset className="ido-dimension-entry" key={key}>
                                <legend>{dim.dimension?.nameEn||dim.dimension?.name_en||'Dimension Category'} {dim.isRequired&&<b>*</b>}</legend>
                                <div className="ido-dimension-option-values">{options.map(option=>{
                                  const optionId=String(option.id||option.code||option.nameEn||option.name_en);
                                  const fullKey=`${indicator.key}:${key}:${optionId}`;
                                  return <label key={optionId}><span>{option.nameEn||option.name_en||option.label||optionId}</span>
                                    <input aria-label={`${indicator.label} ${dim.dimension?.nameEn||'Dimension'} ${option.nameEn||option.name_en||optionId}`}
                                      type={indicator.type==='number'?'number':'text'} value={dimensionValues[fullKey]||''}
                                      onChange={e=>{setDimensionValues(v=>({...v,[fullKey]:e.target.value}));setTouched(true);}} placeholder="Value"/>
                                  </label>;
                                })}</div>
                                {(()=>{
                                  const result=validateHodIndicator(indicator,
                                    categoriesForIndicator(dimensionDefinitions,indicator.key),values,dimensionValues)
                                    .find(item=>String(item.id)===key);
                                  if(!result)return null;
                                  return <small role={!result.valid?"alert":undefined} className={result.valid?'ido-dimension-summary':'ido-indicator-error'}>
                                    {result.reason || (result.total!==null ? `${dim.dimension?.nameEn||'Category'}: ${result.total} / ${values[indicator.key]??'—'} — Matched.` : '')}
                                  </small>;
                                })()}
                                {touched&&invalidFields[`${indicator.key}.dimension.${key}`]&&<small className="ido-indicator-error">{invalidFields[`${indicator.key}.dimension.${key}`]}</small>}
                              </fieldset>;
                            })}
                          </div>;
                        })}
                      </div>
                    </div>
                    {/* Budget + implementation notes: separate from the indicator rows. */}
                    <BudgetEntry form={perfForm} onChange={next=>{setPerfForm(next);setTouched(true);}} context={budgetContext}
                      errors={touched?perfErrors:{}} ytd={budgetYtd} periodLabel={period?shortPeriodLabel(period):''} disabled={busy}/>
                    <NotesEntry form={perfForm} onChange={next=>{setPerfForm(next);setTouched(true);}} errors={touched?perfErrors:{}} disabled={busy}/>
                  </>
                ) : (
                  <div className="ido-upload-workspace">
                    <FileSpreadsheet size={35}/>
                    <h3>Select approved template file</h3>
                    <p>Accepted file formats and maximum size will come from the approved dataset configuration.</p>
                    <input
                      type="file"
                      aria-label="Select approved template file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setSelectedFile(file);
                        setFilename(file?.name || "");
                      }}
                    />
                    {filename && <small>Selected: {filename} ({selectedFile?.size || "previous selection"} bytes)</small>}
                    <div className="ido-upload-warning"><Info size={16}/> File upload is currently unavailable. Use manual data entry.</div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="ido-step-heading">
                  <h2>Review your submission</h2>
                </div>
                {method==='manual'&&kpiStrip}
                <div className="de-review-grid"><div className="de-review-main">
                {method === "manual" ? (
                  <div className="ido-review-table-wrap">
                    <table className="viwanda-table ido-review-table" aria-label="Submission indicator review">
                      <colgroup><col className="ido-review-indicator-col"/><col className="ido-review-value-col"/><col className="ido-review-target-col"/><col className="ido-review-performance-col"/><col className="ido-review-remarks-col"/></colgroup>
                      <thead><tr><th scope="col">Indicator</th><th scope="col">Current value</th><th scope="col">Annual Target</th><th scope="col">Performance</th><th scope="col">Remarks</th></tr></thead>
                      <tbody>{indicators.map((item,index) => {
                        const matchedDimensions=dimensionsForIndicator(dimensionDefinitions,item.key);
                        return <tr key={item.key}>
                          <th scope="row" data-label="Indicator">
                            <span className="ido-review-index">{index+1}</span>
                            <span className="ido-review-indicator-label"><strong>{item.label}</strong>{item.unit&&<small>Unit: {item.unit}</small>}</span>
                          </th>
                          <td data-label="Current value">
                            <span className="ido-review-number">{values[item.key]===undefined||values[item.key]===null||values[item.key]===''?'—':String(values[item.key])}</span>
                            {matchedDimensions.length>0&&<div className="ido-review-dimensions">
                              {matchedDimensions.map(dim=>{
                                const dimId=String(dim.dimensionId||dim.dimension_id||dim.dimension?.id);
                                return <div key={dimId} className="ido-review-dimension-row">
                                  <span className="ido-review-dimension-name">{dim.dimension?.nameEn||dim.dimension?.name_en||'Dimension'}</span>
                                  <div className="ido-review-dimension-options">{(dim.dimension?.options||dim.options||[]).map(option=>{
                                    const optionId=String(option.id||option.code||option.nameEn||option.name_en);
                                    const optionValue=dimensionValues[`${item.key}:${dimId}:${optionId}`];
                                    return <span key={optionId} className="ido-review-dimension-item">
                                      {option.nameEn||option.name_en||optionId}: <b>{optionValue===undefined||optionValue===null||optionValue===''?'—':String(optionValue)}</b>
                                    </span>;
                                  })}</div>
                                </div>;
                              })}
                            </div>}
                          </td>
                          {(()=>{const target=isNumericIndicator(item)?(targetContext?.byIndicator?.[String(item.key)]||targetInputs[item.key]):'';
                            return <><td data-label="Annual Target"><span className="tp-target-value">{target?formatTarget(target):'—'}</span></td>
                              <td data-label="Performance">{target?(()=>{const y=ytdForIndicator({indicator:item,current:values[item.key],ytdState,facts:ytdFacts});return <PerformanceBar compact actual={y.ytd??values[item.key]} target={target} basis={y.text} direction={directionOf(item)}/>;})():<span className="tp-none">—</span>}</td></>;})()}
                          <td data-label="Remarks" className="ido-review-remarks">{item.remarksMode==='hidden'?'—':remarks[item.key]||'—'}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                ) : <p className="ido-review-file">Selected filename (not uploaded): <strong>{filename}</strong></p>}
                {method==='manual'&&<div className="de-review-performance"><PerformanceSummary
                  performance={{approvedBudget:parseMoney(perfForm.approvedBudget),received:parseMoney(perfForm.received),spent:parseMoney(perfForm.spent),
                    achievements:perfForm.achievements,challenges:perfForm.challenges,correctiveActions:perfForm.correctiveActions,meComments:''}}
                  context={budgetContext}/></div>}
                </div>
                <aside className="de-review-side">
                  <section className={`de-ready ${requiredMissing?'is-warn':''}`} aria-label="Submission checklist">
                    <h3>{requiredMissing?'Check before submitting':'Ready to submit'}</h3>
                    <ul className="de-checks">
                      {(chosenObjective||objectiveMissing)&&<li className={objectiveMissing?'warn':''}>{objectiveMissing?'Strategic objective not chosen (step 1)':`Objective ${objectiveLabel(chosenObjective)}`}</li>}
                      <li className={requiredLeft?'warn':''}>{requiredLeft?`${requiredLeft} required indicator${requiredLeft===1?'':'s'} without a value`:'All required indicators have values'}</li>
                      {dimensionIndicators>0&&<li className={breakdownKeys.length?'warn':''}>{breakdownKeys.length?`${breakdownKeys.length} breakdown${breakdownKeys.length===1?'':'s'} to fix`:'Breakdown totals match'}</li>}
                      {method==='manual'&&<li className={perfErrors.achievements||perfErrors.challenges?'warn':''}>{perfErrors.achievements||perfErrors.challenges?'Achievements and challenges are required (step 3)':'Implementation notes written'}</li>}
                      {budgetNow&&<li className={budgetNow.key==='above'?'warn':''}>{`Budget: ${budgetNow.label.toLowerCase()}`}{budgetNow.percent!==null?` (${budgetNow.percent}% of funds received spent)`:''}</li>}
                      {requiredMissing>0&&requiredMissing>requiredLeft+breakdownKeys.length+perfErrorCount&&<li className="warn">Some remarks or targets need attention</li>}
                      {belowHalf.length>0&&<li className="warn">{belowHalf.length} indicator{belowHalf.length===1?'':'s'} below 50% — consider adding a remark</li>}
                    </ul>
                    <dl className="dl-mini">
                      <div><dt>Financial Year</dt><dd>{financialYear||'—'}</dd></div>
                      <div><dt>Reporting Period</dt><dd>{period?.label||'—'}</dd></div>
                      <div><dt>Due Date</dt><dd>{period?.assignmentDeadline?formattedReportingDate(period.assignmentDeadline):'—'}</dd></div>
                      <div><dt>Submission Method</dt><dd>{method === "manual" ? "Manual data entry" : "Upload approved template"}</dd></div>
                    </dl>
                    {wizardActions}
                  </section>
                  {scored.length>0&&<MuCard title="Achievement by indicator" tag="Bar" className="de-chart-card">
                    <div style={{height:200}}><ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scored.map(row=>({name:row.label.length>14?`${row.label.slice(0,13)}…`:row.label,full:row.label,value:Math.round(row.result.percent*10)/10,band:row.result.band}))} margin={{top:8,right:8,left:-18,bottom:0}}>
                        <CartesianGrid vertical={false} stroke="#f1f4f9"/><XAxis dataKey="name" tick={{fontSize:11}} interval={0}/><YAxis tick={{fontSize:11}} domain={[0,dataMax=>Math.max(100,Math.ceil(dataMax))]}/>
                        <Tooltip cursor={{fill:"#f4f7fb"}} formatter={value=>[`${value}%`,"Achievement"]} labelFormatter={(_,items)=>items?.[0]?.payload?.full}/>
                        <Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={30}>{scored.map(row=><Cell key={row.key} fill={row.result.band==='under'?'#d92d20':row.result.band==='excellence'?'#1eb53a':'#e0b400'}/>)}</Bar>
                      </BarChart></ResponsiveContainer></div>
                  </MuCard>}
                </aside></div>
              </div>
            )}

            {step === 4 && (
              <div className="ido-wizard-success" role="status">
                <CheckCircle2 size={54}/>
                <h2>Submission Recorded</h2>
                <p>Your submission has been sent for review. You can view its progress under My Submissions.</p>
                <Link className="btn ido-primary-button" to="/dashboard/submissions/my">View My Submissions <ArrowRight size={17}/></Link>
                {!!otherPendingDatasetId&&<button type="button" className="btn ido-secondary-button" onClick={()=>changeDataset(otherPendingDatasetId)}>
                  Continue with next selected dataset <ArrowRight size={16}/>
                </button>}
              </div>
            )}
          </div>

          {step < 3 && wizardActions}
        </section>
      </div>
    </div>
  );
}
