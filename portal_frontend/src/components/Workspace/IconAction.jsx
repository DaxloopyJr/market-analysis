import { Link } from "react-router-dom";

/**
 * Shared table action icon. Always provide a descriptive title/aria-label.
 * Authorization is checked by RouteAccess and on Laravel API (TODO BACKEND).
 * icon is a Lucide React component, never text-only or emoji.
 */
export default function IconAction({ icon: Icon, label, to, onClick, tone = "view" }) {
  const className = `viwanda-icon-action viwanda-icon-action--${tone}`;
  const contents = <Icon size={18} aria-hidden="true" />;

  if (to) {
    return <Link className={className} to={to} title={label} aria-label={label}>{contents}</Link>;
  }

  return (
    <button type="button" className={className} onClick={onClick} title={label} aria-label={label}>
      {contents}
    </button>
  );
}
