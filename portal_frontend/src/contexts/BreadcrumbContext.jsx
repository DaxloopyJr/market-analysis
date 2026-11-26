import {createContext,useContext} from 'react';

/** Persistent breadcrumb state is owned by DashboardLayout, not a page. */
export const BreadcrumbContext=createContext(null);
export const useBreadcrumbContext=()=>useContext(BreadcrumbContext);
