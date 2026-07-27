/**
 * The marketplace catalogue — the code-defined, closed set of things a tenant
 * can pick from. Like the plan catalogue and the AI tool registry, this is
 * fixed in code (no tenant supplies templates or runs arbitrary code); a
 * tenant browses it and "uses" an item, which seeds an existing tenant-scoped
 * feature (here, a website draft for the AI builder).
 *
 * This is the first marketplace surface (website templates by industry);
 * industry editions and installable modules build on the same pattern.
 */
export interface WebsiteTemplate {
  id: string;
  name: string;
  /** Industry/category, for browsing + filtering. */
  industry: string;
  /** One-line pitch shown on the card. */
  description: string;
  /** The brief handed to the AI website builder when the template is used. */
  brief: string;
  /** Suggested accent color (hex). */
  accentColor: string;
}

const WEBSITE_TEMPLATES: readonly WebsiteTemplate[] =
  [
    {
      id: "restaurant-classic",
      name: "Restaurant & Café",
      industry: "Food & Beverage",
      description:
        "Menu-forward site for a restaurant, café, or bakery with hours and location.",
      brief: "A warm, inviting website for a neighborhood restaurant. Include a hero with the restaurant name and tagline, a short story/about section, a sample menu with 6 dishes and prices, hours and location, and a reservation call-to-action.",
      accentColor: "#c2410c",
    },
    {
      id: "professional-services",
      name: "Professional Services",
      industry: "Services",
      description:
        "Credible site for a law, accounting, or consulting firm with service list and contact.",
      brief: "A clean, trustworthy website for a professional services firm. Include a hero stating the firm's value, an about section establishing expertise, 3–4 core services with brief descriptions, a testimonials strip, and a clear contact/consultation call-to-action.",
      accentColor: "#1d4ed8",
    },
    {
      id: "trades-contractor",
      name: "Trades & Contractor",
      industry: "Home Services",
      description:
        "Lead-focused site for a plumber, electrician, HVAC, or contractor.",
      brief: "A bold, conversion-focused website for a home-services contractor. Include a hero with the company name and a get-a-quote button, the service area, a list of 5 services, a why-choose-us section with trust badges (licensed, insured), and a prominent phone number and quote form.",
      accentColor: "#b45309",
    },
    {
      id: "fitness-studio",
      name: "Fitness & Wellness",
      industry: "Health & Fitness",
      description:
        "Energetic site for a gym, yoga studio, or personal trainer with class schedule.",
      brief: "An energetic website for a fitness studio. Include a hero with a motivating headline and a join-now button, an about section, a weekly class schedule table, 3 membership tiers with prices, a trainer bio, and a first-class-free call-to-action.",
      accentColor: "#15803d",
    },
    {
      id: "ecommerce-boutique",
      name: "Boutique Storefront",
      industry: "Retail",
      description:
        "Product-showcase landing page for a boutique or online store.",
      brief: "A stylish landing page for a boutique retail brand. Include a hero with the brand name and a shop call-to-action, a featured-products grid of 6 items with prices, a brand-story section, a newsletter signup, and social links in the footer.",
      accentColor: "#be185d",
    },
    {
      id: "nonprofit-cause",
      name: "Nonprofit & Cause",
      industry: "Nonprofit",
      description:
        "Mission-driven site for a nonprofit with donate and volunteer calls-to-action.",
      brief: "A heartfelt website for a nonprofit organization. Include a hero stating the mission with a donate button, an impact section with 3 statistics, a story/about section, ways-to-help (donate, volunteer, partner), and a newsletter signup.",
      accentColor: "#7c3aed",
    },
  ];

export function listWebsiteTemplates(): readonly WebsiteTemplate[] {
  return WEBSITE_TEMPLATES;
}

export function getWebsiteTemplate(
  id: string,
): WebsiteTemplate | undefined {
  return WEBSITE_TEMPLATES.find(
    (t) => t.id === id,
  );
}
