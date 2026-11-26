export const showValue = (value) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
