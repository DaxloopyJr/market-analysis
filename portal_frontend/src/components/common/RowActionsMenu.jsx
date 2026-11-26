/**
 * FILE: src/components/common/RowActionsMenu.jsx
 * SHARED FLOW: any Management Table row -> ⋮ -> horizontal original action icon buttons.
 * Original button callbacks, titles, disabled flags, color classes and permissions remain owned by the page.
 * Portal overlay is attached to document.body, OUTSIDE scroll/overflow table containers.
 * No backend calls and no change to action semantics.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EllipsisVertical } from "lucide-react";
import "../../styles/management.css";

export default function RowActionsMenu({ children, label = "Row actions" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 8 });
  const trigger = useRef(null);
  const menu = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const openAbove = window.innerHeight - rect.bottom < 75 && rect.top > 75;
      setPosition({ top: openAbove ? Math.max(8, rect.top - 55) : rect.bottom + 7,
        right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close();
    };
    const onEscape = (event) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
    const onScroll = () => close();
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);
  useEffect(() => {
    if (open) menu.current?.querySelector("button:not(:disabled), a[href]")?.focus();
  }, [open, position.top]);
  return <div className="vw-actions-holder">
    <button ref={trigger} type="button" className="vw-actions-trigger" aria-label={label}
      aria-haspopup="true" aria-expanded={open} title="Actions" onClick={toggle}>
      <EllipsisVertical size={19} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menu} className="vw-actions-popup" role="group" aria-label={label}
      style={{ top: position.top, right: position.right }} onClick={close}>
      {children}
    </div>, document.body)}
  </div>;
}
