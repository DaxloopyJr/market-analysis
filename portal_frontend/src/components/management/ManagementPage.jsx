import PageHeader from "./PageHeader";
import SearchFilters from "./SearchFilters";
import DataTable from "./DataTable";
import Pagination from "./Pagination";
import "./management.css";

/**
 * Shared page appearance ONLY. Each resource owns its API, permissions,
 * validation, fetch timing, search semantics, and add/edit form.
 * Shared styles are imported here; leave the old institutions.css untouched.
 */
export default function ManagementPage({
  breadcrumb, title, description, actionLabel, onAdd,
  searchValue, onSearchValueChange, onSearch, onReset, searchPlaceholder,
  filterValue, onFilterChange, filterOptions, filterAriaLabel,
  columns, records, actions, loading, error, emptyMessage,
  page, pageSize = 20, lastPage, total, totalLabel, onPageChange,
  children,
}) {
  return (
    <main className="vim-management container-fluid px-0">
      <PageHeader {...{ breadcrumb, title, description, actionLabel, onAdd }} />
      <section className="vim-list-card">
        <SearchFilters {...{
          searchValue, onSearchValueChange, onSearch, onReset, searchPlaceholder,
          filterValue, onFilterChange, filterOptions, filterAriaLabel,
        }} />
        {loading && <div role="status" className="alert alert-info mx-3">Loading {title.toLowerCase()}...</div>}
        {error && <div role="alert" className="alert alert-danger mx-3">{error}</div>}
        <DataTable {...{ columns, records, actions, loading, emptyMessage, page, pageSize }} />
        <Pagination {...{ page, lastPage, total, totalLabel, onPageChange }} />
      </section>
      {children}
    </main>
  );
}
