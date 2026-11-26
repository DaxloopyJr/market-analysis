import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Existing institution modal styling and close behavior, shared across pages. */
export default function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const handle = (event) => {
      if (event.key === "Escape" && !document.querySelector(".swal2-container")) onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return createPortal(
    <div
      className="vim-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="vim-dialog vim-dialog-wide" role="dialog" aria-modal="true" aria-label={title}>
        <header className="vim-dialog-header">
          <h2>{title}</h2>
          <button type="button" className="vim-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body
  );
}
