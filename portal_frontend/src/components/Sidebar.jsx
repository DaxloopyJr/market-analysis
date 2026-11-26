import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Building, Building2, CalendarClock, ChartNoAxesCombined, ChevronDown,
  Database, FileBarChart2, LayoutDashboard, ScrollText, Send, Settings2,
  ShieldCheck, SlidersHorizontal, TableProperties, UserCog, Users, UsersRound,
  Workflow, X, ClipboardList, FilePlus2, FilePenLine,
  RotateCcw, History, ListChecks, Eye, Clock3, Bell, Target, Flag,
} from "lucide-react";
import { menuForUser } from "../config/permissionService";
import { institutionLogoUrl, NATIONAL_EMBLEM } from "../utils/institutionLogo";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import "./Sidebar.css";

const icons = {
  Building, Building2, CalendarClock, ChartNoAxesCombined, Database,
  FileBarChart2, LayoutDashboard, ScrollText, Send, Settings2, ShieldCheck,
  SlidersHorizontal, TableProperties, UserCog, Users, UsersRound, Workflow,
  ClipboardList, FilePlus2, FilePenLine, RotateCcw, History, ListChecks, Eye, Clock3, Bell, Target, Flag,
};

/**
 * Sidebar.jsx -> permissionService.jsx -> config/sidebarMenu.js.
 * No direct API calls in reusable components.
 * TODO(BACKEND): authService.jsx gets identity+permissions from Laravel.
 * IMPORTANT: server still checks authorization on every request.
 */
export default function Sidebar({
  open = false,
  collapsed = false,
  onClose,
  user,
}) {
  const location = useLocation();
  const { t } = useLanguage();
  const visibleMenu = menuForUser(user);
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => {
    // Keep collapsed sidebar icon-only; groups open on explicit click as flyouts.
    if (collapsed) {
      setExpandedGroup(null);
      return;
    }
    const selected = visibleMenu.find((item) =>
      item.children?.some((child) => child.path === location.pathname) ||
      (item.id === "submissions" && ["/dashboard/submissions", "/dashboard/data-entry"].includes(location.pathname))
    );
    if (selected && !collapsed) {
      setExpandedGroup(selected.id);
    }
  // Keep open submenu synchronized with the current URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, collapsed, user?.role_code]);

  function toggleGroup(groupId) {
    setExpandedGroup((current) => current === groupId ? null : groupId);
  }

  const institutionName = user?.institution?.name;
  // Institution picture from login / me (profile_image_url or profile_image_path).
  const [brokenPicture, setBrokenPicture] = useState("");
  const pictureUrl = institutionLogoUrl(user?.institution) || (user?.institution ? "" : NATIONAL_EMBLEM);
  const workspacePicture = pictureUrl && pictureUrl !== brokenPicture ? pictureUrl : "";
  const heading = institutionName || user?.department?.name || "MINISTRY OF INDUSTRY AND TRADE";

  return (
    <>
      {open && (
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}

      <aside
        id="dashboard-sidebar"
        className={`dashboard-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Main sidebar"
        onKeyDown={(event) => { if (event.key === "Escape") setExpandedGroup(null); }}
      >
        <div className="dashboard-sidebar-inner">
          <div className="dashboard-institution-header" title={heading}>
            <div className={`dashboard-institution-monogram${workspacePicture ? " has-picture" : ""}`} aria-hidden="true">
              {workspacePicture ? <img src={workspacePicture} alt="" onError={() => setBrokenPicture(workspacePicture)} />
                : user?.institution?.code ? user.institution.code.slice(0, 3).toUpperCase() : institutionName ? institutionName.slice(0, 2).toUpperCase() : "MIT"}
            </div>
            <div className="dashboard-institution-copy">
              <span className="dashboard-institution-caption">{t("YOUR WORKSPACE")}</span>
              <strong className="dashboard-institution-name">{t(heading)}</strong>
              <small className="dashboard-institution-role">{t(user?.role || "Portal User")}</small>
            </div>
          </div>

          <div className="dashboard-sidebar-section-title">{t("NAVIGATION")}</div>
          <nav aria-label="Portal navigation" className="dashboard-nav">
            {visibleMenu.map((item) => {
              const IconComponent = icons[item.icon] || LayoutDashboard;
              const hasChildren = Boolean(item.children);
              const groupActive = hasChildren && (item.children.some((child) => child.path === location.pathname) ||
                (item.id === "submissions" && ["/dashboard/submissions", "/dashboard/data-entry"].includes(location.pathname)));
              const groupExpanded = expandedGroup === item.id;

              if (!hasChildren) {
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    end={item.end}
                    title={collapsed ? t(item.label) : undefined}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `dashboard-menu-item nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    <IconComponent className="dashboard-menu-icon" size={19} aria-hidden="true" />
                    <span className="dashboard-menu-label">{t(item.label)}</span>
                  </NavLink>
                );
              }

              return (
                <div
                  className={`dashboard-nav-group ${groupExpanded ? "is-expanded" : ""} ${groupActive ? "has-current" : ""}`}
                  key={item.id}
                >
                  <button
                    type="button"
                    className={`dashboard-menu-item dashboard-group-button ${groupActive ? "is-current" : ""}`}
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={groupExpanded}
                    aria-controls={`sidebar-children-${item.id}`}
                    title={collapsed ? t(item.label) : undefined}
                  >
                    <IconComponent className="dashboard-menu-icon" size={19} aria-hidden="true" />
                    <span className="dashboard-menu-label">{t(item.label)}</span>
                    <ChevronDown className="dashboard-group-chevron" size={15} aria-hidden="true" />
                  </button>

                  {groupExpanded && (
                    <div
                      className="dashboard-nav-children"
                      id={`sidebar-children-${item.id}`}
                      aria-label={`${t(item.label)} submenu`}
                    >
                      <div className="dashboard-flyout-title">{t(item.label)}</div>
                      {item.children.map((child) => {
                        const ChildIcon = icons[child.icon] || TableProperties;
                        return (
                          <NavLink
                            key={child.id}
                            to={child.path}
                            onClick={() => {
                              if (collapsed) setExpandedGroup(null);
                              onClose?.();
                            }}
                            className={({ isActive }) =>
                              `dashboard-submenu-link ${isActive ? "active" : ""}`
                            }
                          >
                            <ChildIcon size={15} aria-hidden="true" />
                            <span>{t(child.label)}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="dashboard-sidebar-spacer" />

          <div className="dashboard-sidebar-bottom">
            <span className="dashboard-sidebar-bottom-dot" aria-hidden="true" />
            <span className="dashboard-sidebar-bottom-label">{t("Secure Ministry Portal")}</span>
            {open && (
              <button className="dashboard-mobile-close" type="button" onClick={onClose} aria-label="Close sidebar">
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
