import "./StatusBadge.css";

/** Reusable read-only submission state indicator. Not an authorization control. */
export default function StatusBadge({ status = "Draft" }) {
  const variant = {
    Draft: "draft", Submitted: "submitted", "In Review": "review",
    Returned: "returned", Approved: "approved", Published: "published",
  }[status] || "draft";

  return <span className={`ido-status-badge ido-status-${variant}`}>{status}</span>;
}
