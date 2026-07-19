export interface ClientRecord {
  id: string;

  companyName: string;

  primaryContact: string;

  email?: string;

  phone?: string;

  website?: string;

  industry?: string;

  notes?: string;

  createdAt: string;

  updatedAt: string;

  metadata?: Record<string, unknown>;
}