import { findMenuByPath, getVisibleMenu } from "./sidebarMenu";
export const menuForUser = (user) => getVisibleMenu(user);
export const canAccessPath = (user,path) => Boolean(
  user?.permissions?.includes("dashboard.view") && findMenuByPath(path,user)
);
