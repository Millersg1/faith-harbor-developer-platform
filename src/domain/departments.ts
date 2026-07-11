export const departments = [
  "Client Services",
  "Engineering",
  "Publishing",
  "Ministry",
  "Hosting",
  "Artificial Intelligence",
  "Marketing",
  "Sales",
  "Support",
  "Accounting",
  "Analytics",
  "Administration",
] as const;

export type DepartmentName = (typeof departments)[number];
