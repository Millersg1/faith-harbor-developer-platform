/**
 * A hosting plan sold to customers. Prices are stored in whole cents to
 * avoid floating-point money errors. The same catalog is shown under
 * each hosting brand (Faith Harbor Web Hosting, All Elite Hosting), so
 * plans are brand-agnostic.
 */
export type HostingPlanKind =
  | "shared"
  | "reseller";

export interface HostingPlanSpecs {
  /**
   * NVMe storage in megabytes.
   */
  storageMb: number;

  /**
   * Monthly bandwidth in gigabytes.
   */
  bandwidthGb: number;

  /**
   * Number of websites/addon domains allowed. -1 means unlimited.
   */
  websites: number;

  emailAccounts: number;

  mysqlDatabases: number;
}

export interface HostingPlanRecord {
  id: string;

  kind: HostingPlanKind;

  name: string;

  /**
   * URL-safe identifier, e.g. "starter-nvme".
   */
  slug: string;

  description?: string;

  priceMonthlyCents: number;

  priceYearlyCents: number;

  specs: HostingPlanSpecs;

  /**
   * Customer-facing bullet features shown on the plan card.
   */
  features: string[];

  /**
   * The WHM package to provision this plan under. Defaults to the plan
   * name; confirm it matches a package that exists in WHM.
   */
  whmPackage?: string;

  /**
   * Highlights this plan as "Most Popular".
   */
  popular: boolean;

  /**
   * Whether the plan is offered for sale.
   */
  active: boolean;

  /**
   * Display order, ascending.
   */
  sortOrder: number;

  createdAt: string;

  updatedAt: string;
}

export interface HostingPlanRequest {
  kind?: HostingPlanKind;
  name: string;
  slug?: string;
  description?: string;
  priceMonthlyCents: number;
  priceYearlyCents?: number;
  specs: HostingPlanSpecs;
  features?: string[];
  whmPackage?: string;
  popular?: boolean;
  active?: boolean;
  sortOrder?: number;
}
