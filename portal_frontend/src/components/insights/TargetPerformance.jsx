/**
 * FILE: src/components/insights/TargetPerformance.jsx
 * Shared Annual Target + performance bar used by Data Entry and every review page
 * (IHoD, AO, MDO, MDD, Submission Details).
 * Bands: < 50% Under Performance · 50–80% Good · > 80% Excellence.
 */
import {Target} from 'lucide-react';
import {formatTarget, performanceOf} from '../../utils/annualTargets.js';
import './TargetPerformance.css';

/** Inline bar only (for table cells). */
export function PerformanceBar({actual, target, compact = false, basis = '', direction = 'higher_is_better'}) {
  const result = performanceOf(actual, target, direction);
  if (!result) return <span className="tp-none">{target ? 'No value' : 'No target'}</span>;
  return <div className={`tp-bar-wrap tp-${result.band} ${compact ? 'is-compact' : ''}`}
    title={`${result.rounded}% of annual target — ${result.label}`}>
    <div className="tp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(result.percent))} aria-label={`Performance ${result.rounded}%`}>
      <span style={{width: `${Math.min(100, result.percent)}%`}}/>
    </div>
    <div className="tp-bar-meta"><b>{result.rounded}%</b><span className="tp-band">{result.label}</span></div>
    {basis&&<small className="tp-basis" title="Value compared with the annual target">{basis}</small>}
  </div>;
}

/** Target value + bar block (review cards). `ytd` = aggregated actual (yearToDate.js). */
export default function TargetPerformance({actual, target, yearLabel, unit, basis = '', ytd = null, legacy = false, direction = 'higher_is_better'}) {
  if (!target) return <div className="tp-block tp-empty"><Target size={15}/><span>{legacy ? 'Annual target not recorded at submission (older submission)' : `No annual target set${yearLabel ? ` for ${yearLabel}` : ''}`}</span></div>;
  return <div className="tp-block">
    <div className="tp-head"><Target size={15}/><span>Annual Target{yearLabel ? ` (${yearLabel})` : ''}</span>
      <strong>{formatTarget(target)}{unit ? ` ${unit}` : ''}</strong></div>
    {ytd!=null&&<div className="tp-ytd"><span>Actual to date</span><strong>{formatTarget(ytd)}{unit ? ` ${unit}` : ''}</strong></div>}
    <PerformanceBar actual={ytd ?? actual} target={target} basis={basis} direction={direction}/>
    {direction === 'lower_is_better' && <small className="tp-dir">Lower is better</small>}
  </div>;
}
