export interface ClientRecord {
  id: string;

  companyName: string;

  primaryContact: string;

  email?: string;

  phone?: string;

  website?: string;

  industry?: string;

  notes?: string;

  /**
   * The brand this client belongs to (which of our businesses they
   * are a customer of), when set.
   */
  brandId?: string;

  createdAt: string;

  updatedAt: string;

  metadata?: Record<string, unknown>;
}

export interface CreateClientRequest {
  companyName: string;

  primaryContact: string;

  email?: string;

  phone?: string;

  website?: string;

  industry?: string;

  notes?: string;

  brandId?: string;

  metadata?: Record<string, unknown>;
}