import type { DepartmentName } from "../domain/departments";

export type DepartmentHealthStatus =
  | "healthy"
  | "attention"
  | "critical"
  | "unknown";

export interface DepartmentHealth {
  status: DepartmentHealthStatus;
  activeWorkflows: number;
  pendingApprovals: number;
  lastCheckedAt: string;
}

export interface Department {
  id: string;
  name: DepartmentName;
  description: string;
  mission: string;
  owner: string;
  workflows: string[];
  aiProviders: string[];
  plugins: string[];
  permissions: string[];
  successMetrics: string[];
  health: DepartmentHealth;
}
