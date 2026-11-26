/**
 * FILE: src/pages/Admin/PermissionTree.jsx
 * USED BY: src/pages/Admin/RolesPermissions.jsx in Add, Edit, Details and Manage.
 * FLOW: Laravel GET /permissions -> src/API/roles.jsx -> grouping helper
 *     -> module/permission checkboxes -> permission IDs -> POST/PUT /roles.
 * IMPORTANT: Labels/groups are presentation only. Laravel enforces grants.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { groupPermissions, permissionLabel } from "./permissionGrouping";

export default function PermissionTree({
  permissions = [],
  selectedIds = [],
  onChange,
  search = "",
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState({});

  const groups = useMemo(
    () => groupPermissions(permissions),
    [permissions]
  );

  const selected = useMemo(
    () => new Set(selectedIds.map(Number)),
    [selectedIds]
  );

  const query = search.trim().toLowerCase();

  // Searching a group name shows all its children; searching a permission
  // shows only matching children, without losing other checked IDs.
  const visibleGroups = groups
    .map(({ title, items }) => {
      const allChildrenMatch = title.toLowerCase().includes(query);
      const children = !query || allChildrenMatch
        ? items
        : items.filter((permission) => (
          [permission.name, permission.code, permission.description, permissionLabel(permission)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        ));

      return { title, children, total: items.length };
    })
    .filter(({ children }) => children.length > 0);

  function togglePermission(id) {
    if (readOnly || !onChange) return;
    const next = new Set(selected);
    const numericId = Number(id);

    if (next.has(numericId)) next.delete(numericId);
    else next.add(numericId);

    onChange([...next]);
  }

  function toggleGroup(children) {
    if (readOnly || !onChange) return;
    const visibleIds = children.map(({ id }) => Number(id));
    const allChecked = visibleIds.every((id) => selected.has(id));
    const next = new Set(selected);

    visibleIds.forEach((id) => {
      if (allChecked) next.delete(id);
      else next.add(id);
    });

    onChange([...next]);
  }

  if (!visibleGroups.length) {
    return (
      <p className="vrp-empty" role="status">
        No permissions match your search.
      </p>
    );
  }

  return (
    <div className="vrp-tree" aria-label="Permissions grouped by module">
      {visibleGroups.map(({ title, children }, index) => {
        const ids = children.map(({ id }) => Number(id));
        const checkedCount = ids.filter((id) => selected.has(id)).length;
        const allChecked = checkedCount === ids.length;
        const partlyChecked = checkedCount > 0 && !allChecked;
        // Default: Dashboard and Submissions open as in the approved mockup.
        const isOpen = Boolean(query) || (expanded[title] ?? index < 2);

        return (
          <section className="vrp-tree-group" key={title}>
            <div className="vrp-tree-group-head">
              <button
                type="button"
                className="vrp-tree-expander"
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}
                aria-expanded={isOpen}
                disabled={Boolean(query)}
                onClick={() => setExpanded((old) => ({
                  ...old,
                  [title]: !isOpen,
                }))}
              >
                {isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              </button>

              <label className="vrp-tree-module-label">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={readOnly}
                  ref={(input) => {
                    if (input) input.indeterminate = partlyChecked;
                  }}
                  onChange={() => toggleGroup(children)}
                  aria-label={`Select ${title} permissions`}
                />
                <strong>{title}</strong>
              </label>

              <span className="vrp-tree-count">
                {checkedCount}/{children.length}
              </span>
            </div>

            {isOpen && (
              <div className="vrp-tree-children">
                {children.map((permission) => (
                  <label
                    className="vrp-tree-leaf"
                    key={permission.id}
                    title={permission.description || permission.code || ""}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(Number(permission.id))}
                      disabled={readOnly}
                      onChange={() => togglePermission(permission.id)}
                    />
                    <span>{permissionLabel(permission)}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
