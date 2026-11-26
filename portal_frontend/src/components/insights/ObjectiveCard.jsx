/**
 * FILE: src/components/insights/ObjectiveCard.jsx
 * Annual strategic objective of a submission, shown at EVERY step of the approval journey
 * (IDO details, IHOD, AO, MDO, MDD) through the shared ReviewSummary.
 * Source: SubmissionSnapshot.annualObjectiveContext.selectedObjective (frozen once submitted),
 * or submittedVersions[].objective_snapshot for older payloads. Nothing is invented: when Laravel
 * sends no objective (no plan / legacy record) the card is not shown.
 */
import {Target} from 'lucide-react';
import {annualObjectiveContextOf} from '../../utils/annualObjective.js';
import './ObjectiveCard.css';

export default function ObjectiveCard({record}) {
  const context = annualObjectiveContextOf(record);
  const objective = context?.selected;
  if (!objective) return null;
  const year = objective.yearLabel || context.yearLabel;
  return <div className="obj-card" aria-label="Strategic objective">
    <span className="obj-card-code">{objective.code || <Target size={18}/>}</span>
    <div className="obj-card-text">
      <small>Strategic objective{year ? ` · ${year}` : ''}</small>
      <b>{objective.description || '—'}</b>
      <span>{[objective.strategicPlanName, objective.versionNumber ? `Version ${objective.versionNumber}` : ''].filter(Boolean).join(' · ')}</span>
    </div>
    <span className={`obj-card-state ${context.readOnly ? 'is-locked' : ''}`}>{context.readOnly ? `Locked for ${year || 'the year'}` : 'Draft selection'}</span>
  </div>;
}
