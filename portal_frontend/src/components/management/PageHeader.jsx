import { Plus } from "lucide-react";

/** Common breadcrumb/title/add-button area. Uses original vim-* CSS classes. */
export default function PageHeader({ breadcrumb, title, description, actionLabel, onAdd }) {
  return (
    <div className="vim-heading">
      <div>
        <div className="vim-breadcrumb">{breadcrumb}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {onAdd && (
        <button type="button" className="btn btn-primary vim-add" onClick={onAdd}>
          <Plus size={17} /> {actionLabel || "Add New"}
        </button>
      )}
    </div>
  );
}
