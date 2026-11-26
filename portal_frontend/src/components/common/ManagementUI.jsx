/**
 * FILE: src/components/common/ManagementUI.jsx
 * SHARED UI FLOW: feature pages (Datasets, Reference, Administration, future pages)
 * -> management.css + tokens.css -> authenticated DashboardLayout.
 * Reusable presentation wrappers ONLY; feature pages own validation, permissions,
 * API calls and content. The wrappers introduce no backend assumptions.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TableLoader } from "./LoadingState";

const cls = (...names) => names.filter(Boolean).join(" ");
export function ManagementPage({ children, className = "" }) {
  return <section className={cls("vw-management-page", className)}>{children}</section>;
}
export function ManagementCard({ children, className = "" }) {
  return <div className={cls("vw-management-card", className)}>{children}</div>;
}
export function ManagementToolbar({ children, className = "" }) {
  return <div className={cls("vw-management-toolbar", className)}>{children}</div>;
}
export function ManagementForm({ children, onSubmit, className = "" }) {
  return <form className={cls("vw-management-form", className)} onSubmit={onSubmit}>{children}</form>;
}
export function ManagementTable({ children, loading = false, className = "", label = "Loading table…" }) {
  return <div className={cls("vw-management-table-wrap", className)} aria-busy={loading}>
    <div className="table-responsive"><table className="table vw-management-table">{children}</table></div>
    <TableLoader active={loading} label={label} />
  </div>;
}
/** Dialog renders in body portal. Keep custom feature dialogs for approved bespoke layouts. */
export function ManagementModal({ title, children, onClose, footer, wide = false }) {
  const closeButton = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
      if (event.key === "Tab") {
        const dialog = closeButton.current?.closest("[role=dialog]");
        const controls = [...(dialog?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || [])];
        if (!controls.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {document.removeEventListener("keydown", onKey);previousFocus?.focus?.();};
  }, [onClose]);
  return createPortal(<div className="vw-management-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose?.()}}>
    <section className={cls("vw-management-modal",wide&&"vw-management-modal-wide")} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" ref={closeButton} aria-label="Close dialog" onClick={onClose}><X size={18}/></button></header>
      <div className="vw-management-modal-body">{children}</div>
      {footer&&<footer>{footer}</footer>}
    </section>
  </div>,document.body);
}
