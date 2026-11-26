/**
 * FILE: src/pages/Login/PasswordChecklist.jsx
 * Shared strength bar + ✓ checklist for Forgot / Reset / Activate and My Profile.
 * Rules are passed in by each page; this component adds no new validation of its own.
 */
export default function PasswordChecklist({ rules, value, extra = [] }) {
  const checks = rules.map(([label, test]) => [label, Boolean(value) && test(value)]);
  const all = [...checks, ...extra];
  const met = checks.filter(([, ok]) => ok).length;
  const level = value ? Math.max(1, Math.round((met / Math.max(rules.length, 1)) * 4)) : 0;
  return (
    <div className="pw-check" aria-live="polite">
      <div className={`pw-bar level-${level}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <ul className="pw-list">
        {all.map(([label, ok]) => <li key={label} className={ok ? 'met' : ''}>{label}</li>)}
      </ul>
    </div>
  );
}
