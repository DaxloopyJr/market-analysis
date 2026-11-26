import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page, lastPage, total, totalLabel, onPageChange }) {
  return (
    <footer className="vim-pagination-bar">
      <span>Page {page} of {lastPage} · {total} total {totalLabel || "records"}</span>
      <div className="vim-pagination-controls">
        <button
          type="button" disabled={page <= 1}
          onClick={() => onPageChange(page - 1)} aria-label="Previous"
        ><ChevronLeft size={16} /></button>
        <button
          type="button" disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)} aria-label="Next"
        ><ChevronRight size={16} /></button>
      </div>
    </footer>
  );
}
