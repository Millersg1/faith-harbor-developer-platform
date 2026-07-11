import type { Department } from "./Department";
import { DepartmentRegistry } from "./DepartmentRegistry";

export class DepartmentService {
  constructor(
    private readonly registry = new DepartmentRegistry(),
  ) {}

  createDepartment(department: Department): Department {
    return this.registry.register(department);
  }

  getDepartment(id: string): Department {
    const department = this.registry.get(id);

    if (!department) {
      throw new Error(`Department '${id}' was not found.`);
    }

    return department;
  }

  listDepartments(): Department[] {
    return this.registry.list();
  }

  departmentExists(id: string): boolean {
    return this.registry.exists(id);
  }

  removeDepartment(id: string): boolean {
    return this.registry.unregister(id);
  }

  countDepartments(): number {
    return this.registry.count();
  }
}