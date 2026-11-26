import { Eye, Pencil, Power } from "lucide-react";

export default function RowActions({ name, onView, onEdit, onToggle, toggleLabel }) {
  return (
    <>
      {onView && (
        <button type="button" title="Details" aria-label={`Details ${name}`} onClick={onView}>
          <Eye size={16} />
        </button>
      )}
      {onEdit && (
        <button type="button" title="Edit" aria-label={`Edit ${name}`} onClick={onEdit}>
          <Pencil size={16} />
        </button>
      )}
      {onToggle && (
        <button type="button" title={toggleLabel} aria-label={`${toggleLabel} ${name}`} onClick={onToggle}>
          <Power size={16} />
        </button>
      )}
    </>
  );
}
