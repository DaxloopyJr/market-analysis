import { showValue } from "./utils";

/** columns: [{ key, label, render?: (record) => ReactNode }]. */
export default function DataTable({
  columns, records, actions, loading, emptyMessage, page = 1, pageSize = 20,
}) {
  const colSpan = columns.length + 1 + (actions ? 1 : 0);
  return (
    <div className="vim-table-scroll">
      <table className={`table vim-table mb-0${columns.length >= 5 ? " vim-table-wide" : ""}`}>
        <thead><tr>
          <th>#</th>
          {columns.map((col) => <th key={col.key}>{col.label}</th>)}
          {actions && <th className="text-end">Actions</th>}
        </tr></thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id ?? `${page}-${index}`}>
              <td>{(page - 1) * pageSize + index + 1}</td>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(record) : showValue(record[col.key])}
                </td>
              ))}
              {actions && <td><div className="vim-row-actions">{actions(record)}</div></td>}
            </tr>
          ))}
          {!loading && records.length === 0 && (
            <tr><td colSpan={colSpan} className="vim-empty">{emptyMessage || "No records found."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
