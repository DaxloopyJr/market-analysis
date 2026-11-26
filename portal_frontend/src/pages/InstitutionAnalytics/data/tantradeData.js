/**
 * TANTRADE Data Warehouse Requirements - UI demo dataset.
 * Only sample observations explicitly stated in the source document are entered.
 * Null/undefined means "No data", NOT zero. These are NOT live API values.
 * All observations are annual; quarterly/monthly data was not provided.
 */
export const YEARS = ["2024/2025", "2025/2026"];
export const DEFAULT_YEAR = "2024/2025";
export const DEFAULT_PERIOD = "annual";

const measure = (id, name, values = {}, unit = "number", description = "") => ({
  id, name, unit, description, values,
});

export const DATA = {
  promotion: [
    measure("events", "Trade promotion events coordinated (incoming/outgoing)", { "2024/2025": 13 }),
    measure("permits", "Trade promotion permits issued", { "2025/2026": 25 }),
    measure("companiesParticipated", "Companies participated", { "2024/2025": 420 }),
    measure("smesParticipated", "SMEs participated"),
    measure("contractsSigned", "MoUs / contracts signed"),
    measure("contractValue", "Value of MoUs / contracts signed", {}, "tzs"),
    measure("contractsImplemented", "MoUs / contracts implemented"),
    measure("businessDeals", "Business deals generated", { "2024/2025": 24.26 }, "tzsBillion"),
    measure("businessDealsUtilized", "Value of business deals utilized", {}, "tzs"),
    measure("newMarkets", "New export markets entered", { "2024/2025": 1 }),
    measure("exportValue", "Exports arising from opportunities shared", {}, "tzs"),
    measure("manufacturedExports", "Export value of manufactured / value-added products", {}, "tzs"),
    measure("jobs", "Job opportunities created"),
  ],
  information: [
    measure("companiesInfo", "Companies accessing trade information", { "2024/2025": 120000, "2025/2026": 147996 }),
    measure("smesInfo", "SMEs accessing trade information"),
    measure("procedures", "Trade procedures / business processes documented", { "2024/2025": 50 }),
    measure("exporters", "Exporters registered in database", { "2024/2025": 11098 }),
    measure("importers", "Importers registered in database", { "2024/2025": 9238 }),
    measure("reports", "Trade data / market intelligence reports published", { "2024/2025": 50 }),
    measure("inquiries", "Trade inquiries received and utilized"),
    measure("businessLeads", "Value of business leads generated", {}, "tzs"),
    measure("prices", "Product prices collected, analysed and disseminated"),
  ],
  sme: [
    measure("smesTrained", "SMEs trained", { "2024/2025": 585, "2025/2026": 2614 }),
    measure("exportersTrained", "Exporters / potential exporters trained", { "2024/2025": 246 }),
    measure("firstTimeExporters", "New-to-export SMEs onboarded"),
    measure("womenYouth", "Women- and youth-led enterprises supported"),
    measure("madeInTanzania", "Made in Tanzania mark adoption rate", {}, "percent"),
    measure("ntbs", "Non-tariff barriers identified and resolved"),
    measure("formalised", "Cross-border and informal traders formalised"),
    measure("ppdMeetings", "Public–private dialogue meetings coordinated"),
    measure("ppdImplemented", "PPD meeting resolutions implemented"),
  ],
  finance: [
    measure("budget", "Approved budget", {}, "tzs"),
    measure("revenue", "Own-source revenue collected", {}, "tzs"),
    measure("emoluments", "Personal emoluments", {}, "tzs"),
    measure("recurrent", "Recurrent expenditure", {}, "tzs"),
    measure("development", "Development expenditure", {}, "tzs"),
    measure("consolidated", "Contribution to Consolidated Fund", {}, "tzs"),
  ],
  projects: [
    measure("expoPlan", "Mwl. J. K. Nyerere Expo City master plan developed", {}, "status"),
    measure("properties", "Assets and properties developed", {}, "status", "The document names Dodoma, Siha, Zanzibar and Mwanza; it does not give completion status."),
  ],
  audit: [
    measure("queries", "Number of audit queries"),
    measure("implemented", "Audit queries implemented"),
    measure("inProgress", "Audit queries under implementation"),
    measure("overtaken", "Audit queries overtaken by events"),
  ],
  legal: [
    measure("legalContracts", "Contracts signed"),
    measure("legalMous", "MoUs signed"),
    measure("courtCases", "Court cases attended"),
    measure("lawsReviewed", "Laws and regulations reviewed"),
    measure("lawsTranslated", "Laws and regulations translated"),
  ],
};

export const CATEGORIES = [
  { key: "overview", label: "Overview", icon: "LayoutDashboard" },
  { key: "promotion", label: "Trade Promotion & Market Access", icon: "Globe2" },
  { key: "information", label: "Trade Information", icon: "FileBarChart2" },
  { key: "sme", label: "SME Development", icon: "UsersRound" },
  { key: "finance", label: "Financial Performance", icon: "ChartNoAxesCombined" },
  { key: "projects", label: "Development Projects", icon: "Building2" },
  { key: "audit", label: "CAG Audit", icon: "ShieldCheck" },
  { key: "legal", label: "Legal & Compliance", icon: "Scale" },
];

export const CATEGORY_INFO = {
  promotion: {
    title: "Trade Promotion & Market Access",
    subtitle: "Events, companies, trade agreements, business deals and new markets.",
    kpis: ["events", "permits", "companiesParticipated", "smesParticipated", "contractsSigned", "businessDeals"],
    charts: ["events", "companiesParticipated", "businessDeals", "newMarkets"],
    icon: "Globe2",
  },
  information: {
    title: "Trade & Market Information",
    subtitle: "Visibility and utilization of trade information services.",
    kpis: ["companiesInfo", "smesInfo", "procedures", "exporters", "importers", "reports"],
    charts: ["companiesInfo", "exporters", "importers", "reports"],
    icon: "FileBarChart2",
  },
  sme: {
    title: "SME & Business Development",
    subtitle: "Exporter readiness, SME capacity building and competitiveness.",
    kpis: ["smesTrained", "exportersTrained", "firstTimeExporters", "womenYouth", "madeInTanzania", "ntbs"],
    charts: ["smesTrained", "exportersTrained", "madeInTanzania", "ntbs"],
    icon: "UsersRound",
  },
  finance: {
    title: "Financial Performance",
    subtitle: "Approved budget, own-source revenue and expenditure tracking.",
    kpis: ["budget", "revenue", "emoluments", "recurrent", "development", "consolidated"],
    charts: ["budget", "revenue", "recurrent", "development"],
    icon: "ChartNoAxesCombined",
  },
  projects: {
    title: "Development Projects",
    subtitle: "Expo City master plan and TANTRADE asset development locations.",
    kpis: ["expoPlan", "properties"],
    charts: ["expoPlan", "properties"],
    icon: "Building2",
  },
  audit: {
    title: "CAG Audit Performance",
    subtitle: "Audit queries and implementation of audit observations.",
    kpis: ["queries", "implemented", "inProgress", "overtaken"],
    charts: ["queries", "implemented", "inProgress", "overtaken"],
    icon: "ShieldCheck",
  },
  legal: {
    title: "Legal & Compliance",
    subtitle: "Contracts, MoUs, court cases and legal services.",
    kpis: ["legalContracts", "legalMous", "courtCases", "lawsReviewed", "lawsTranslated"],
    charts: ["legalContracts", "legalMous", "courtCases", "lawsReviewed"],
    icon: "Scale",
  },
};

export function allMeasures() {
  return Object.values(DATA).flat();
}
export function getMeasure(id) {
  return allMeasures().find((entry) => entry.id === id);
}
export function observedValue(measure, year, period = "annual") {
  if (!measure || period !== "annual") return null;
  const value = measure.values?.[year];
  return value === null || value === undefined ? null : value;
}
export function displayValue(value, unit = "number") {
  if (value === null || value === undefined || value === "") return "No data";
  if (unit === "tzsBillion") return `TZS ${Number(value).toLocaleString("en-GB")} bn`;
  if (unit === "tzs") return `TZS ${Number(value).toLocaleString("en-GB")}`;
  if (unit === "percent") return `${value}%`;
  if (unit === "status") return String(value);
  return Number(value).toLocaleString("en-GB");
}
export function changePct(measure, period = "annual") {
  const first = observedValue(measure, YEARS[0], period);
  const second = observedValue(measure, YEARS[1], period);
  if (typeof first !== "number" || typeof second !== "number" || first === 0) return null;
  return ((second - first) / Math.abs(first)) * 100;
}
