/** Reusable section title — never append decorative explanatory subtitles. */
export default function SectionHeader({ title, actions, className = "" }) {
  return (
    <div className={`viwanda-section-heading ${className}`.trim()}>
      <h2>{title}</h2>
      {actions && <div className="viwanda-section-actions">{actions}</div>}
    </div>
  );
}
