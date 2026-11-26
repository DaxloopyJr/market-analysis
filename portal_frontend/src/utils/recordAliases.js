/**
 * Laravel camelCase/snake_case read aliases used only for display.
 * Never changes request payloads, permission logic, current step or status.
 */
import {readField, hasValue} from './serverFields.js';

const aliasFields = {
  institution: {
    short_name:['shortName'],reporting_channel:['reportingChannel'],
    is_active:['isActive'],users_count:['usersCount'],
    created_at:['createdAt'],updated_at:['updatedAt'],
    logo_url:['logoUrl','logo.url'],
  },
  department: {
    parent_department_id:['parentDepartmentId','parentDepartment.id'],
    parent_department:['parentDepartment'], institution_id:['institutionId','institution.id'],
    users_count:['usersCount'],created_at:['createdAt'],updated_at:['updatedAt'],
    is_active:['isActive'],
  },
  user: {
    name:['fullName','full_name','displayName'],
    institution_id:['institutionId','institution.id'],
    department_id:['departmentId','department.id'],
    role_code:['roleCode','roles.0.code'],
    affiliation_type:['affiliationType'],
    last_login_at:['lastLoginAt'],
    is_active:['isActive'],created_at:['createdAt'],updated_at:['updatedAt'],
  },
  delegation: {
    delegate_user_id:['delegateUserId','delegate.id'],
    delegator_user_id:['delegatorUserId','delegator.id'],
    role_id:['roleId','role.id'],department_id:['departmentId','department.id'],
    effective_from:['effectiveFrom'],effective_to:['effectiveTo'],
    created_at:['createdAt'],
  },
  dataset: {
    datasetName:['dataset_name','dataName','data_name'],
    datasetCode:['dataset_code'],
    collectionMethod:['collection_method'],
    sourceDescription:['source_description'],
    responsibleUserId:['responsible_user_id'],
    institutionId:['institution_id','institution.id'],
    departmentId:['department_id','department.id'],
    createdAt:['created_at'],updatedAt:['updated_at'],
  },
};

export function normalizeReadAliases(row,entity) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const result = {...row};
  for(const [key,aliases] of Object.entries(aliasFields[entity]??{})) {
    if(!hasValue(result[key])) {
      const value=readField(row,...aliases);
      if(hasValue(value))result[key]=value;
    }
  }
  return result;
}
export function normalizeReadRows(rows,entity){
  return Array.isArray(rows)?rows.map(row=>normalizeReadAliases(row,entity)):[];
}
