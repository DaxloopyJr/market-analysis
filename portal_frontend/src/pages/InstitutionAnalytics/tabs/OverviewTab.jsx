import { getMeasure } from "../data/tantradeData";
import {
  ComparisonChart, KpiCard, QuickHighlights, SectionHeader,
} from "../components/AnalyticsComponents";

const overviewKpis = ["events", "companiesParticipated", "businessDeals", "companiesInfo", "smesTrained", "newMarkets"];
const highlights = ["permits", "exporters", "importers", "reports", "jobs"];

export default function OverviewTab({ year, period, onDetails, onNavigate }) {
  return (
    <div className="tia-tab-content">
      <SectionHeader title="Institutional Performance Overview" subtitle="A snapshot of trade promotion, market information and SME development indicators.">
        <span className="tia-indicator-count">TANTRADE · {year}</span>
      </SectionHeader>
      <div className="tia-kpi-grid">
        {overviewKpis.map((id, index) => <KpiCard key={id} measure={getMeasure(id)} index={index} selectedYear={year} period={period} onDetails={onDetails}/>)}
      </div>
      <div className="tia-chart-grid tia-overview-grid">
        <ComparisonChart measure={getMeasure("events")} period={period} onDetails={onDetails}/>
        <ComparisonChart measure={getMeasure("companiesInfo")} period={period} onDetails={onDetails}/>
        <ComparisonChart measure={getMeasure("smesTrained")} period={period} onDetails={onDetails}/>
        <QuickHighlights measures={highlights.map(getMeasure)} year={year} period={period} onDetails={onDetails}/>
      </div>
      <div className="tia-overview-nav">
        <div><h3>Explore analytics by category</h3><p>Open a specialized dashboard with KPI cards, annual comparisons and all related indicators.</p></div>
        <div className="tia-nav-pills">
          <button type="button" onClick={() => onNavigate("promotion")}>Trade Promotion</button>
          <button type="button" onClick={() => onNavigate("information")}>Trade Information</button>
          <button type="button" onClick={() => onNavigate("sme")}>SME Development</button>
          <button type="button" onClick={() => onNavigate("finance")}>Financial Performance</button>
        </div>
      </div>
    </div>
  );
}
