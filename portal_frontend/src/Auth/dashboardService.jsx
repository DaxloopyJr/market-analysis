/**
 * DASHBOARD DATA SERVICE
 * Used by: pages/Dashboard/Dashboard.jsx
 * Preview data lives here, never inside page JSX.
 * All API endpoints below are examples, NOT confirmed routes.
 */
const previewOverview = {
  statistics: [
    { label: "Reporting Obligations", value: 12, theme: "blue" },
    { label: "Submitted", value: 8, theme: "cyan" },
    { label: "Pending", value: 2, theme: "orange" },
    { label: "Returned", value: 1, theme: "red" },
    { label: "Approved", value: 18, theme: "green" },
  ],
  obligations: [
    { dataset: "Market Access and Entry Information", period: "FY 2025/26", due: "30 Sep 2026", status: "Draft" },
    { dataset: "Financial Data", period: "Q1 2026/27", due: "15 Oct 2026", status: "Not Started" },
    { dataset: "Trade Development & Facilitation", period: "FY 2025/26", due: "30 Sep 2026", status: "Submitted" },
    { dataset: "Access to Trade & Market Information", period: "Q4 2025/26", due: "30 Sep 2026", status: "Returned" },
  ],
  deadlines: [
    { due: "30 Sep 2026", title: "Market Access and Entry Information" },
    { due: "15 Oct 2026", title: "Financial Data — Q1" },
  ],
  recentActivity: [
    { theme: "blue", description: "Market Access and Entry Information — Submitted to HOD" },
    { theme: "green", description: "Trade Development & Facilitation — Approved" },
    { theme: "red", description: "Access to Trade & Market Information — Returned" },
  ],
};

export async function getDashboardOverview() {
  // TODO(BACKEND): replace preview data when Laravel endpoint is available.
  // Example ONLY (unconfirmed):
  // import api from "./Api";
  // const response = await api.get("/api/v1/dashboard/overview");
  // return response.data;
  // Expected shape:
  // { statistics: [{ label, value, theme }], obligations: [{dataset,period,due,status}],
  //   deadlines: [{due,title}], recentActivity: [{theme,description}] }
  return previewOverview;
}
