import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, ChartColumnIncreasing, ChevronRight,
  CircleHelp, Database, Eye, FileSearch, Minus, Search, X,
} from "lucide-react";
import { YEARS, changePct, displayValue, observedValue } from "../data/tantradeData";

const colorStyles = ["blue", "mint", "gold", "lilac", "rose", "cyan"];

export function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="tia-section-header">
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      {children}
    </div>
  );
}

export function KpiCard({ measure, selectedYear, period, index = 0, onDetails }) {
  if (!measure) return null;
  const value = observedValue(measure, selectedYear, period);
  const change = selectedYear === YEARS[1] ? changePct(measure, period) : null;
  const hasChange = change !== null;
  return (
    <button type="button" className={`tia-kpi tia-tone-${colorStyles[index % colorStyles.length]}`} onClick={() => onDetails(measure)} title={`View indicator: ${measure.name}`}>
      <span className="tia-kpi-icon"><BarChart3 size={21} /></span>
      <span className="tia-kpi-label">{measure.name}</span>
      <strong className={value === null ? "tia-missing" : ""}>{displayValue(value, measure.unit)}</strong>
      <span className="tia-kpi-year">{selectedYear} · {period === "annual" ? "Annual" : period === "quarterly" ? "Quarterly" : "Monthly"}</span>
      <span className="tia-kpi-foot">
        {hasChange ? (
          <span className={change >= 0 ? "tia-positive" : "tia-negative"}>
            {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(change).toFixed(1)}% vs {YEARS[0]}
          </span>
        ) : value === null ? "Not reported for this period" : "Sample observation"}
      </span>
    </button>
  );
}

// Dependency-free chart: renders observations only (no interpolated or invented values).
export function ComparisonChart({ measure, period, onDetails }) {
  const observations = YEARS.map((year) => ({ year, value: observedValue(measure, year, period) }));
  const valid = observations.filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value));
  const max = Math.max(...valid.map((row) => row.value), 0);
  const hasData = valid.length > 0;
  return (
    <section className="tia-chart-card">
      <div className="tia-card-heading">
        <div className="tia-card-heading-left"><span className="tia-small-icon"><ChartColumnIncreasing size={17} /></span><h3>{measure.name}</h3></div>
        {onDetails && <button type="button" className="tia-icon-btn" aria-label={`Show ${measure.name} details`} onClick={() => onDetails(measure)}><ChevronRight size={18}/></button>}
      </div>
      {hasData ? (
        <div className="tia-chart-canvas" role="img" aria-label={`${measure.name}: ${observations.map((r) => `${r.year} ${displayValue(r.value, measure.unit)}`).join(", ")}`}>
          <div className="tia-chart-guide"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
          <div className="tia-plot">
            <div className="tia-grid-lines" aria-hidden="true"><i/><i/><i/><i/><i/></div>
            {observations.map((entry, index) => (
              <div className="tia-bar-column" key={entry.year}>
                <div className="tia-bar-stand">
                  {entry.value !== null ? (
                    <div className={`tia-bar tia-bar-${index}`} style={{ height: `${Math.max(3, max ? (entry.value / max) * 100 : 3)}%` }}>
                      <span className="tia-bar-value">{displayValue(entry.value, measure.unit)}</span>
                    </div>
                  ) : <span className="tia-bar-missing">No data</span>}
                </div>
                <span className="tia-bar-year">FY {entry.year}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyData compact detail="No annual values were provided for this indicator." />}
      <p className="tia-chart-footer">Source: TANTRADE Data Warehouse Requirements · annual sample</p>
    </section>
  );
}

export function EmptyData({ detail = "Values have not been reported in the supplied document.", compact = false }) {
  return (
    <div className={`tia-empty ${compact ? "tia-empty-compact" : ""}`}>
      <span className="tia-empty-icon"><FileSearch size={25}/></span>
      <strong>No data available</strong>
      <p>{detail}</p>
    </div>
  );
}

export function IndicatorTable({ measures, year, period, onDetails, title = "Detailed indicators" }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => measures.filter((measure) => measure.name.toLowerCase().includes(query.trim().toLowerCase())), [measures, query]);
  return (
    <section className="tia-table-card">
      <div className="tia-table-header">
        <div><h3>{title}</h3><p>Annual indicator values from the requirements document</p></div>
        <label className="tia-search"><Search size={16}/><input aria-label="Find indicator" placeholder="Find indicator..." value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      </div>
      <div className="tia-table-wrap">
        <table className="tia-table">
          <thead><tr><th>#</th><th>Indicator</th><th>FY 2024/2025</th><th>FY 2025/2026</th><th>Change</th><th className="tia-align-right">Details</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={6}><EmptyData compact detail="No indicators match your search."/></td></tr> : filtered.map((measure, index) => {
              const delta = changePct(measure, period);
              return (
                <tr key={measure.id}>
                  <td>{index + 1}</td><td><strong>{measure.name}</strong></td>
                  {YEARS.map((yr) => <td key={yr} className={yr === year ? "tia-selected-year" : ""}>{displayValue(observedValue(measure, yr, period), measure.unit)}</td>)}
                  <td>{delta === null ? <span className="tia-muted"><Minus size={13} /> —</span> : <span className={delta >= 0 ? "tia-positive" : "tia-negative"}>{delta >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {Math.abs(delta).toFixed(1)}%</span>}</td>
                  <td className="tia-align-right"><button type="button" className="tia-view-btn" title="View indicator details" onClick={() => onDetails(measure)}><Eye size={16}/><span className="tia-visually-hidden">View {measure.name}</span></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="tia-table-footer"><Database size={14}/> {filtered.length} of {measures.length} indicators · "No data" means missing, not zero.</footer>
    </section>
  );
}

export function IndicatorDialog({ measure, onClose, period }) {
  useEffect(() => {
    if (!measure) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; };
  }, [measure, onClose]);
  if (!measure) return null;
  return (
    <div className="tia-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="tia-modal" role="dialog" aria-modal="true" aria-labelledby="tia-dialog-title">
        <header><div><span>Indicator Details</span><h2 id="tia-dialog-title">{measure.name}</h2></div><button type="button" onClick={onClose} className="tia-icon-btn" aria-label="Close"><X size={20}/></button></header>
        <div className="tia-modal-content">
          <div className="tia-modal-notice"><CircleHelp size={18}/> Values below are sample observations from the uploaded TANTRADE data requirements, not live reported results.</div>
          <div className="tia-detail-grid">
            <div><span>Institution</span><strong>TANTRADE</strong></div>
            <div><span>Reporting frequency</span><strong>{period === "annual" ? "Annual (available sample)" : `${period} (no values supplied)`}</strong></div>
            <div><span>FY 2024/2025</span><strong>{displayValue(observedValue(measure, YEARS[0], period), measure.unit)}</strong></div>
            <div><span>FY 2025/2026</span><strong>{displayValue(observedValue(measure, YEARS[1], period), measure.unit)}</strong></div>
          </div>
          {measure.description ? <p className="tia-detail-note">{measure.description}</p> : null}
          <h3>Year-on-year comparison</h3>
          <ComparisonChart measure={measure} period={period} onDetails={null}/>
        </div>
        <footer><button type="button" className="tia-btn tia-btn-primary" onClick={onClose}>Close details</button></footer>
      </section>
    </div>
  );
}

export function ProjectRegister() {
  return (
    <section className="tia-table-card tia-project-register">
      <div className="tia-table-header"><div><h3>Assets & properties – locations named in the document</h3><p>Projects and locations are listed; completion percentages and budgets were not provided.</p></div></div>
      <div className="tia-table-wrap"><table className="tia-table"><thead><tr><th>#</th><th>Location</th><th>Project status</th><th>Budget</th><th>Completion</th></tr></thead><tbody>
        {["Dodoma", "Siha", "Zanzibar", "Mwanza"].map((name, i) => <tr key={name}><td>{i+1}</td><td><strong>{name}</strong></td><td><span className="tia-status-empty">No data</span></td><td>No data</td><td>No data</td></tr>)}
      </tbody></table></div>
      <p className="tia-register-note">The Mwl. J. K. Nyerere Expo City Master Plan is listed separately in the requirements; no progress percentage is supplied.</p>
    </section>
  );
}

export function QuickHighlights({ measures, year, period, onDetails }) {
  return (
    <section className="tia-highlights">
      <div className="tia-card-heading"><div className="tia-card-heading-left"><span className="tia-small-icon"><ChartColumnIncreasing size={18}/></span><h3>Key performance highlights</h3></div></div>
      <div className="tia-highlight-list">
        {measures.map((measure) => <button type="button" key={measure.id} onClick={() => onDetails(measure)}>
          <span>{measure.name}</span><strong>{displayValue(observedValue(measure, year, period), measure.unit)}</strong><ChevronRight size={15}/>
        </button>)}
      </div>
      <p className="tia-highlight-note">Selected year: {year}. Only available sample values are displayed.</p>
    </section>
  );
}
