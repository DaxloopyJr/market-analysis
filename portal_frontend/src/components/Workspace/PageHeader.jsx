/**
 * Shared page header across ALL authenticated roles.
 * Titles only: no eyebrow, duplicated breadcrumb or decorative subtitle.
 * Primary actions, contextual badges and necessary filters go into actions.
 */
export default function PageHeader({ title, actions, className = "" }) {
  return (
    <header className={`viwanda-page-heading ${className}`.trim()}>
      <h1>{title}</h1>
      {actions && <div className="viwanda-page-actions">{actions}</div>}
    </header>
  );
}
