/**
 * FILE: src/pages/Admin/institutionPreviewData.js
 * FLOW: Admin/Institutions.jsx -> this file -> in-memory React state only.
 * SAMPLE DATA ONLY: no Laravel calls, no PostgreSQL writes, no persistence.
 * These names illustrate the UI; contacts are deliberately fictional example.test.
 * Remove this data only after backend API contracts have been verified.
 
export const institutionTypes = [
  "Government Agency",
  "Regulatory Agency",
  "Research Institution",
  "Development Agency",
  "Trade Promotion Agency",
  "Technical Agency",
];

export const regions = [
  "Arusha",
  "Dar es Salaam",
  "Dodoma",
  "Iringa",
  "Mwanza",
  "Morogoro",
  "Tanga",
  "Zanzibar",
];

// These districts are examples for the UI, not an official nationwide registry.
export const districtsByRegion = {
  Arusha: ["Arusha City", "Arumeru"],
  "Dar es Salaam": ["Ilala", "Kinondoni", "Temeke", "Ubungo"],
  Dodoma: ["Dodoma City", "Chamwino"],
  Iringa: ["Iringa Municipal", "Kilolo"],
  Mwanza: ["Nyamagana", "Ilemela"],
  Morogoro: ["Morogoro Municipal", "Mvomero"],
  Tanga: ["Tanga City", "Muheza"],
  Zanzibar: ["Mjini", "Magharibi"],
};

const sample = [
  [1, "Centre for Agricultural Mechanization and Rural Technology", "CAMARTEC", "Research Institution", "Arusha", "Arusha City"],
  [2, "Tanzania Bureau of Standards", "TBS", "Regulatory Agency", "Dar es Salaam", "Ilala"],
  [3, "Small Industries Development Organization", "SIDO", "Development Agency", "Dodoma", "Dodoma City"],
  [4, "Tanzania Trade Development Authority", "TANTRADE", "Trade Promotion Agency", "Dar es Salaam", "Ilala"],
  [5, "Tanzania Engineering and Manufacturing Design Organisation", "TEMDO", "Technical Agency", "Arusha", "Arusha City"],
  [6, "Tanzania Industrial Research and Development Organisation", "TIRDO", "Research Institution", "Dar es Salaam", "Kinondoni"],
  [7, "Fair Competition Commission", "FCC", "Regulatory Agency", "Dar es Salaam", "Ilala"],
  [8, "National Development Corporation", "NDC", "Development Agency", "Dar es Salaam", "Ilala"],
  [9, "College of Business Education", "CBE", "Government Agency", "Dodoma", "Dodoma City"],
  [10, "Fair Competition Tribunal", "FCT", "Regulatory Agency", "Dar es Salaam", "Ilala"],
  [11, "Warehouse Licensing Regulatory Board", "WRRB", "Regulatory Agency", "Dar es Salaam", "Temeke"],
];

export const institutionPreviewSeed = sample.map((item, index) => ({
  id: item[0],
  name: item[1],
  code: item[2],
  type: item[3],
  region: item[4],
  district: item[5],
  status: index === 6 ? "inactive" : "active",
  email: `demo-${item[2].toLowerCase()}@example.test`,
  phone: "",
  website: "",
  physicalAddress: "",
  postalAddress: "",
  focalPerson: "",
  establishedDate: "",
  description: "Sample record for interface preview only.",
  notes: "",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
}));

export const emptyInstitution = {
  name: "",
  code: "",
  type: "",
  region: "",
  district: "",
  status: "active",
  email: "",
  phone: "",
  website: "",
  physicalAddress: "",
  postalAddress: "",
  focalPerson: "",
  establishedDate: "",
  description: "",
  notes: "",
};
*/