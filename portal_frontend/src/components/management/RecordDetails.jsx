import { Pencil } from "lucide-react";
import { showValue } from "./utils";

/** Details display only; does not fetch arbitrary undocumented detail routes. */
export default function RecordDetails({
  fields, title, subtitle, status, Icon, canManage, editLabel, onClose, onEdit,
}) {
  return (
    <>
      <div className="vim-detail-heading">
        {Icon && <span className="vim-detail-symbol"><Icon size={26} /></span>}
        <div><strong>{title}</strong><small>{subtitle}</small></div>
        {status && <span className={`vim-status vim-status-${status}`}>{status}</span>}
      </div>
      <div className="vim-details-list">
        {fields.map(([label, value]) => (
          <div className="vim-detail-row" key={label}>
            <span>{label}</span><strong>{showValue(value)}</strong>
          </div>
        ))}
      </div>
      <footer className="vim-dialog-footer">
        <button className="btn btn-outline-secondary" type="button" onClick={onClose}>Close</button>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            <Pencil size={15} /> {editLabel || "Edit"}
          </button>
        )}
      </footer>
    </>
  );
}
