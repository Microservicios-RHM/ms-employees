export interface DepartmentGateway {
  existsById(id: string): Promise<boolean>;
}

