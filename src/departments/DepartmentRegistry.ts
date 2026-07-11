import type { Department } from "./Department";

export class DepartmentRegistry {
  private readonly departments = new Map<string, Department>();

  register(department: Department): Department {
    if (this.departments.has(department.id)) {
      throw new Error(
        `Department '${department.id}' is already registered.`,
      );
    }

    this.departments.set(department.id, department);

    return department;
  }

  get(id: string): Department | undefined {
    return this.departments.get(id);
  }

  list(): Department[] {
    return Array.from(this.departments.values());
  }

  count(): number {
    return this.departments.size;
  }

  exists(id: string): boolean {
    return this.departments.has(id);
  }

  unregister(id: string): boolean {
    return this.departments.delete(id);
  }

  clear(): void {
    this.departments.clear();
  }
}