import type { HostingPlanRequest } from "./HostingPlanTypes";

/**
 * The standard shared-hosting catalog, shown under each hosting brand.
 * Prices are in cents; yearly is 20% off the 12-month total. These seed
 * the catalog on first run and can be edited afterward.
 */
const SHARED_FEATURES = [
  "Free SSL Certificate",
  "cPanel Control Panel",
  "Free website migration",
  "Price locked — never increases",
];

export const defaultHostingPlans: readonly HostingPlanRequest[] =
  [
    {
      kind: "shared",
      name: "Starter NVMe",
      slug: "starter-nvme",
      description:
        "A simple fast hosting plan for small websites and landing pages.",
      priceMonthlyCents: 499,
      priceYearlyCents: 4790,
      specs: {
        storageMb: 10240,
        bandwidthGb: 100,
        websites: 1,
        emailAccounts: 10,
        mysqlDatabases: 5,
      },
      features: SHARED_FEATURES,
      whmPackage: "Starter NVMe",
      popular: false,
      active: true,
      sortOrder: 1,
    },
    {
      kind: "shared",
      name: "Business NVMe",
      slug: "business-nvme",
      description:
        "A stronger hosting plan for growing business websites.",
      priceMonthlyCents: 999,
      priceYearlyCents: 9590,
      specs: {
        storageMb: 25600,
        bandwidthGb: 250,
        websites: 5,
        emailAccounts: 25,
        mysqlDatabases: 10,
      },
      features: SHARED_FEATURES,
      whmPackage: "Business NVMe",
      popular: true,
      active: true,
      sortOrder: 2,
    },
    {
      kind: "shared",
      name: "Pro NVMe",
      slug: "pro-nvme",
      description:
        "More resources for high-traffic websites and client projects.",
      priceMonthlyCents: 1999,
      priceYearlyCents: 19190,
      specs: {
        storageMb: 51200,
        bandwidthGb: 500,
        websites: 10,
        emailAccounts: 50,
        mysqlDatabases: 25,
      },
      features: SHARED_FEATURES,
      whmPackage: "Pro NVMe",
      popular: false,
      active: true,
      sortOrder: 3,
    },
    {
      kind: "shared",
      name: "Elite NVMe",
      slug: "elite-nvme",
      description:
        "Premium shared hosting with higher limits for serious websites.",
      priceMonthlyCents: 2999,
      priceYearlyCents: 28790,
      specs: {
        storageMb: 102400,
        bandwidthGb: 1000,
        websites: 25,
        emailAccounts: 100,
        mysqlDatabases: 50,
      },
      features: SHARED_FEATURES,
      whmPackage: "Elite NVMe",
      popular: false,
      active: true,
      sortOrder: 4,
    },
  ];
