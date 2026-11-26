/**
 * "Rows per page" for every table (approved 28 Oct 2026): 10, 20, 50, 100, 200, 500.
 * usePageSize(tableKey, initial) remembers each table's choice in this browser (best effort; safe if storage is blocked).
 * Laravel lists allow perPage ≤ 100; server-paginated tables use fetchUiPage() for 200 / 500.
 */
import {PAGE_SIZES} from '../../utils/pagedFetch.js';
import './PageSizeSelect.css';

/** Compact labelled dropdown placed in the table footer next to the pager. */
export default function PageSizeSelect({value,onChange,disabled=false,label='Rows per page'}){
  return <label className="vw-page-size">
    <span>{label}</span>
    <select value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))} aria-label={label}>
      {PAGE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}
    </select>
  </label>;
}
