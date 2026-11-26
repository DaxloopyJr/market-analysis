/**
 * FILE: src/pages/InstitutionAnalytics/InstitutionAnalytics.jsx
 * ROUTE: /dashboard/institution-analytics/tantrade (configure in App.jsx)
 * PURPOSE: Renders ONLY main content, relying on your existing DashboardLayout
 *          to provide the sidebar, breadcrumb/topbar and authentication.
 * DATA: Source-labelled samples from TANTRADE requirements. NO invented live API.
 * NOTE: Add actual API mapping after the reporting endpoints are confirmed.
 */
import { useCallback, useState } from "react";
import {
  BarChart3, Building2, ChartNoAxesCombined, Database,
  Download, FileBarChart2, Globe2, LayoutDashboard, RefreshCw,
  Scale, ShieldCheck, SlidersHorizontal, UsersRound,
} from "lucide-react";
import {
  CATEGORIES, DATA, DEFAULT_PERIOD, DEFAULT_YEAR, YEARS,
  displayValue, observedValue,
} from "./data/tantradeData";
import { IndicatorDialog } from "./components/AnalyticsComponents";
import OverviewTab from "./tabs/OverviewTab";
import TradePromotionTab from "./tabs/TradePromotionTab";
import TradeInformationTab from "./tabs/TradeInformationTab";
import SMEDevelopmentTab from "./tabs/SMEDevelopmentTab";
import FinancialPerformanceTab from "./tabs/FinancialPerformanceTab";
import DevelopmentProjectsTab from "./tabs/DevelopmentProjectsTab";
import CAGAuditTab from "./tabs/CAGAuditTab";
import LegalComplianceTab from "./tabs/LegalComplianceTab";
import "./InstitutionAnalytics.css";

const TAB_ICONS = {
  overview: LayoutDashboard,
  promotion: Globe2,
  information: FileBarChart2,
  sme: UsersRound,
  finance: ChartNoAxesCombined,
  projects: Building2,
  audit: ShieldCheck,
  legal: Scale,
};

const CONTENT = {
  overview: OverviewTab,
  promotion: TradePromotionTab,
  information: TradeInformationTab,
  sme: SMEDevelopmentTab,
  finance: FinancialPerformanceTab,
  projects: DevelopmentProjectsTab,
  audit: CAGAuditTab,
  legal: LegalComplianceTab,
};

function csvCell(value) {
  // Excel CSV injection defense if future values are loaded from external sources.
  const raw = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadReport(category, year, period) {
  const rows = category === "overview" ? Object.values(DATA).flat() : DATA[category];
  const matrix = [
    ["Institution", "Indicator", "Unit", "FY 2024/2025", "FY 2025/2026", "Selected Year", "Selected Period", "Selected Value", "Data Source"],
    ...rows.map((item) => [
      "TANTRADE", item.name, item.unit,
      displayValue(observedValue(item, YEARS[0], period), item.unit),
      displayValue(observedValue(item, YEARS[1], period), item.unit),
      year, period,
      displayValue(observedValue(item, year, period), item.unit),
      "TANTRADE Data Warehouse Requirements – sample only",
    ]),
  ];
  const csv = `\ufeff${matrix.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `TANTRADE_${category}_${year.replace("/", "-")}_${period}_sample.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function InstitutionAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [draftYear, setDraftYear] = useState(DEFAULT_YEAR);
  const [draftPeriod, setDraftPeriod] = useState(DEFAULT_PERIOD);
  const [draftCategory, setDraftCategory] = useState("overview");
  const [selectedIndicator, setSelectedIndicator] = useState(null);

  const navigate = (key) => {
    if (!CONTENT[key]) return;
    setActiveTab(key);
    setDraftCategory(key);
  };
  const applyFilters = (e) => {
    e.preventDefault();
    setYear(draftYear);
    setPeriod(draftPeriod);
    navigate(draftCategory);
  };
  const resetFilters = () => {
    setYear(DEFAULT_YEAR);
    setPeriod(DEFAULT_PERIOD);
    setDraftYear(DEFAULT_YEAR);
    setDraftPeriod(DEFAULT_PERIOD);
    navigate("overview");
  };
  const closeDetails = useCallback(() => setSelectedIndicator(null), []);
  const ActiveContent = CONTENT[activeTab];

  return (
    <main className="tia-page" aria-label="TANTRADE Institutional Analytics">
      <div className="tia-heading-row">
        <div className="tia-brand-block">
          <span className="tia-brand-mark"><BarChart3 size={27} /><b>TANTRADE</b></span>
          <div className="tia-heading-text">
            <h1>Tanzania Trade Development Authority (TANTRADE)</h1>
            <h2>Institutional Analytics</h2>
            <p>Key performance indicators based on TANTRADE data warehouse requirements</p>
          </div>
        </div>
        <button type="button" className="tia-btn tia-btn-primary tia-export" onClick={() => downloadReport(activeTab, year, period)}>
          <Download size={17}/> Export CSV
        </button>
      </div>

      <form className="tia-filter-box" onSubmit={applyFilters}>
        <div className="tia-filter-field"><label htmlFor="tia-financial-year">Financial Year</label>
          <select id="tia-financial-year" value={draftYear} onChange={(e) => setDraftYear(e.target.value)}>
            {YEARS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="tia-filter-field"><label htmlFor="tia-period">Reporting Period</label>
          <select id="tia-period" value={draftPeriod} onChange={(e) => setDraftPeriod(e.target.value)}>
            <option value="annual">Annual</option>
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="tia-filter-field"><label htmlFor="tia-category">Indicator Category</label>
          <select id="tia-category" value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
            {CATEGORIES.map((category) => <option value={category.key} key={category.key}>{category.label}</option>)}
          </select>
        </div>
        <div className="tia-filter-actions">
          <button type="button" className="tia-btn tia-btn-outline" onClick={resetFilters}><RefreshCw size={15}/> Reset</button>
          <button type="submit" className="tia-btn tia-btn-primary"><SlidersHorizontal size={15}/> Apply Filters</button>
        </div>
      </form>

      <div className="tia-reporting-alert"><Database size={17} />
        <span><strong>Sample data preview.</strong> Figures shown are taken only from the TANTRADE requirements document. This is not a live API report. Monthly and quarterly observations were not supplied; missing values display <b>No data</b>.</span>
      </div>

      <div className="tia-dashboard-panel">
        <div className="tia-tabs-scroller">
          <nav className="tia-tabs" aria-label="Institutional analytics categories">
            {CATEGORIES.map((category) => {
              const Icon = TAB_ICONS[category.key];
              return <button key={category.key} type="button" className={`tia-tab ${activeTab === category.key ? "active" : ""}`} onClick={() => navigate(category.key)} aria-current={activeTab === category.key ? "page" : undefined}>
                <Icon size={16}/><span>{category.label}</span>
              </button>;
            })}
          </nav>
        </div>
        <ActiveContent year={year} period={period} onDetails={setSelectedIndicator} onNavigate={navigate}/>
      </div>
      {selectedIndicator ? <IndicatorDialog measure={selectedIndicator} period={period} onClose={closeDetails}/> : null}
    </main>
  );
}
