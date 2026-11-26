import { RotateCcw, Search } from "lucide-react";

/** Search submit is page-owned. Optional dropdown can filter status, role, etc. */
export default function SearchFilters({
  searchValue, onSearchValueChange, onSearch, onReset, searchPlaceholder,
  filterValue, onFilterChange, filterOptions, filterAriaLabel,
}) {
  return (
    <form className={`vim-filters vim-filter-form${filterOptions?.length ? "" : " vim-filter-form--no-filter"}`} onSubmit={(event) => {
      event.preventDefault();
      onSearch();
    }}>
      <label className="vim-search-field">
        <Search size={17} />
        <input
          value={searchValue}
          onChange={(event) => onSearchValueChange(event.target.value)}
          placeholder={searchPlaceholder || "Search..."}
          aria-label="Search records"
        />
      </label>
      {filterOptions?.length > 0 && (
        <select
          aria-label={filterAriaLabel || "Filter (current page)"}
          value={filterValue ?? ""}
          onChange={(event) => onFilterChange(event.target.value)}
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
      <button className="btn btn-primary" type="submit">Search</button>
      <button className="btn btn-outline-secondary" type="button" onClick={onReset}>
        <RotateCcw size={14} /> Reset
      </button>
    </form>
  );
}
