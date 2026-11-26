import { CATEGORY_INFO, DATA, getMeasure } from "../data/tantradeData";
import { ComparisonChart, IndicatorTable, KpiCard, ProjectRegister, SectionHeader } from "./AnalyticsComponents";

/** Reused by each of the seven institutional analysis categories. */
export default function CategoryDashboard({ category, year, period, onDetails }) {
  const config = CATEGORY_INFO[category];
  const measures = DATA[category];
  if (!config || !measures) return null;
  return (
    <div className="tia-tab-content">
      <SectionHeader title={config.title} subtitle={config.subtitle}>
        <span className="tia-indicator-count">{measures.length} indicators defined</span>
      </SectionHeader>
      <div className={`tia-kpi-grid ${config.kpis.length <= 2 ? "tia-kpi-grid-short" : ""}`}>
        {config.kpis.map((id, index) => <KpiCard key={id} measure={getMeasure(id)} selectedYear={year} period={period} index={index} onDetails={onDetails}/>)}
      </div>
      <div className="tia-chart-grid">
        {config.charts.map((id) => <ComparisonChart key={id} measure={getMeasure(id)} period={period} onDetails={onDetails}/>)}
      </div>
      {category === "projects" ? <ProjectRegister/> : null}
      <IndicatorTable key={category} measures={measures} year={year} period={period} onDetails={onDetails}/>
    </div>
  );
}
