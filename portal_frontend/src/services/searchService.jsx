/**
 * Search bar: components/Topbar.jsx.
 * CURRENT FUNCTION: locally search permitted PAGE TITLES from sidebarMenu.js.
 * Does not search database records and never requests a backend.
 *
 * TODO(BACKEND): If global record search is part of approved scope:
 *   import api from "../Auth/Api";
 *   const {data} = await api.get("/api/v1/search", {
 *     params:{q:"market",types:"datasets,submissions",page:1}
 *   });
 *   // EXAMPLE response, NOT CONFIRMED:
 *   {"data":[{"type":"dataset","id":21,"title":"Market Access", 
 *     "url":"/dashboard/datasets/21"}], "meta":{"total":1}}
 *
 * Requirements: server search MUST filter results by user role, dataset
 * consumer permissions AND institution/department scope, with pagination.
 * Confirm endpoint, ranking, search dimensions and URL policy with Laravel.
 */
export const searchServiceReady = false;
