/**
 * The marketplace catalogue — the code-defined, closed set of things a tenant
 * can pick from. Like the plan catalogue and the AI tool registry, this is
 * fixed in code (no tenant supplies templates or runs arbitrary code); a
 * tenant browses it and "uses"/"applies" an item, which seeds existing
 * tenant-scoped features (a website draft, brand accent, AI employees).
 *
 * Every website template has a matching industry edition, so a tenant can
 * either grab just a site or set up the whole line of business in one click.
 *
 * ── Extending the marketplace ────────────────────────────────────────────
 * The marketplace is designed to grow. To add an offering you edit ONLY this
 * file — everything downstream is data-driven and picks it up automatically:
 * the list APIs iterate these arrays, and the dashboard renders whatever the
 * APIs return (no hard-coded lists in the UI).
 *
 *   1. Append a {@link WebsiteTemplate} to WEBSITE_TEMPLATES (unique `id`,
 *      a detailed `brief`, a `#rrggbb` accent).
 *   2. Append a matching {@link IndustryEdition} to INDUSTRY_EDITIONS that
 *      references that template `id` and lists 1–2 {@link EditionEmployee}s
 *      whose `toolNames` are real AI tool-registry tools.
 *
 * Invariants are enforced by tests (`marketplace.test.ts`): every template
 * has an edition, every edition points at a real template and has employees,
 * and every employee tool name exists in the registry. So the catalogue can
 * be extended safely and the suite fails loudly if an entry is inconsistent.
 * The set stays code-defined (closed) on purpose — tenants never supply
 * templates or code — which is the marketplace's core safety property.
 */
export type MarketplaceTier =
  | "free"
  | "premium";

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
  /**
   * "premium" templates require a plan that unlocks them (Business and up);
   * absent/"free" means any plan can use them. There is no per-template
   * charge — premium is gated by plan tier.
   */
  tier?: MarketplaceTier;
}

/** True when a template requires a premium (paid, higher-tier) plan. */
export function isPremium(item: {
  tier?: MarketplaceTier;
}): boolean {
  return item.tier === "premium";
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
    {
      id: "real-estate",
      name: "Real Estate",
      industry: "Real Estate",
      description:
        "Listing-forward site for an agent or brokerage with featured properties and valuation CTA.",
      brief: "A polished website for a real-estate agent or brokerage. Include a hero with a search-inspired headline and a request-a-valuation button, a featured-listings grid of 6 properties with price, beds, baths, and location, an about-the-agent section with credentials, a client testimonials strip, and a contact form for buyers and sellers.",
      accentColor: "#0f766e",
    },
    {
      id: "medical-dental",
      name: "Medical & Dental",
      industry: "Healthcare",
      description:
        "Reassuring practice site for a clinic, dentist, or specialist with services and booking.",
      brief: "A clean, reassuring website for a medical or dental practice. Include a hero with the practice name and a book-an-appointment button, a services section with 5 treatments, a meet-the-doctors section with credentials, an insurance-and-payment note, office hours and location, and a patient contact form. Professional and trustworthy tone; no medical claims beyond services offered.",
      accentColor: "#0891b2",
    },
    {
      id: "salon-spa",
      name: "Salon & Spa",
      industry: "Beauty & Wellness",
      description:
        "Elegant site for a hair salon, spa, or med-spa with services menu and booking.",
      brief: "An elegant, calming website for a salon or spa. Include a hero with the brand name and a book-now button, a services menu with 6 treatments and prices, a gallery/atmosphere section, a team/stylists section, a gift-cards note, hours and location, and a booking call-to-action.",
      accentColor: "#db2777",
    },
    {
      id: "saas-tech",
      name: "SaaS & Technology",
      industry: "Technology",
      description:
        "Conversion-focused landing page for a software product or tech startup.",
      brief: "A modern, conversion-focused landing page for a SaaS product. Include a hero with a crisp value proposition and a start-free-trial button, a 3-feature benefits section, a how-it-works section in 3 steps, a social-proof/logos strip, a simple 3-tier pricing section, and a final call-to-action. Clean, confident, product-led tone.",
      accentColor: "#4f46e5",
    },
    {
      id: "auto-repair",
      name: "Automotive Service",
      industry: "Automotive",
      description:
        "Trust-building site for an auto-repair shop or detailer with services and booking.",
      brief: "A trustworthy website for an automotive repair shop. Include a hero with the shop name and a book-service button, a services section with 6 offerings (oil change, brakes, diagnostics, tires, etc.), a why-choose-us section with certifications and warranty, customer reviews, hours and location, and an appointment request form.",
      accentColor: "#dc2626",
    },
    {
      id: "education-coaching",
      name: "Education & Coaching",
      industry: "Education",
      description:
        "Program-forward site for a tutor, coach, course creator, or training academy.",
      brief: "An inspiring website for an education or coaching business. Include a hero with an outcome-focused headline and an enroll/book-a-call button, a programs section with 3 offerings and outcomes, an about-the-instructor section with credentials, student testimonials with results, an FAQ, and an enrollment call-to-action.",
      accentColor: "#ca8a04",
    },
    {
      id: "church-ministry",
      name: "Church & Ministry",
      industry: "Faith & Community",
      description:
        "Welcoming site for a church or ministry with service times, sermons, and giving.",
      brief: "A warm, welcoming website for a church or ministry. Include a hero with the church name, a short welcome, weekend service times, and a plan-your-visit button; an about / what-we-believe section; a ministries section (kids, youth, small groups, outreach); a recent-sermons/messages section; an upcoming-events list; a giving/donate call-to-action; and location with service times in the footer. Warm, hopeful, and inclusive tone; no denominational assumptions beyond what a church would state about itself.",
      accentColor: "#5b21b6",
    },
    // ── Premium template systems (require Business+ plan) ──────────────────
    {
      id: "wedding-events",
      name: "Wedding & Events Venue",
      industry: "Events & Hospitality",
      description:
        "Elegant, image-led site for a wedding or events venue with galleries and enquiry booking.",
      brief: "An elegant, romantic website for a wedding and events venue. Include a full-bleed hero with the venue name and a check-availability button; an about section evoking the atmosphere; a spaces/packages section with 3 offerings; a gallery section; a testimonials section from couples; an FAQ; and an enquiry form capturing event date, guest count, and type. Refined, premium tone.",
      accentColor: "#9d174d",
      tier: "premium",
    },
    {
      id: "boutique-hotel",
      name: "Boutique Hotel & Hospitality",
      industry: "Hospitality",
      description:
        "Refined site for a boutique hotel or B&B with rooms, amenities, and reservations.",
      brief: "A refined website for a boutique hotel. Include a hero with the property name and a book-your-stay button; an about section on the experience; a rooms section with 3 room types, rates, and features; an amenities section; a local-area/things-to-do section; guest reviews; and a reservation enquiry form. Warm, upscale, hospitable tone.",
      accentColor: "#115e59",
      tier: "premium",
    },
    {
      id: "financial-advisory",
      name: "Financial Advisory",
      industry: "Finance",
      description:
        "Authoritative site for a wealth manager, advisor, or accounting firm with a consultation CTA.",
      brief: "An authoritative, trustworthy website for a financial advisory firm. Include a hero stating the firm's promise with a book-a-consultation button; an about section establishing credentials and fiduciary approach; a services section with 4 offerings (planning, investments, tax, retirement); a process section in 3 steps; a testimonials strip; and a contact/consultation form. Calm, credible, compliant tone; no guaranteed-return claims.",
      accentColor: "#1e3a8a",
      tier: "premium",
    },
    {
      id: "luxury-real-estate",
      name: "Luxury Real Estate",
      industry: "Real Estate",
      description:
        "High-end, image-forward site for luxury listings and private-client representation.",
      brief: "A high-end, image-forward website for a luxury real-estate practice. Include a cinematic hero with a signature-listings headline and a private-consultation button; a featured-properties grid of 4 premium listings with price and key details; an about-the-advisor section emphasizing discretion and track record; a marketing/approach section; client testimonials; and a private enquiry form. Sophisticated, understated, premium tone.",
      accentColor: "#78350f",
      tier: "premium",
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

/** A suggested AI employee an edition sets up (persona + tool whitelist). */
export interface EditionEmployee {
  name: string;
  title: string;
  persona: string;
  toolNames: string[];
}

/**
 * An industry edition: a one-click bundle that seeds a tenant for a line of
 * business — a website draft (by template), a brand accent, and a couple of
 * ready-to-use AI employees scoped to relevant tools. Applying one only ever
 * ADDS (a draft website, employees) and sets the accent; it never deletes
 * existing data. Code-defined, closed set. Every website template has one.
 *
 * Employee `toolNames` reference real AI tool-registry tools; at runtime the
 * console intersects them with the acting user's role, so an employee can
 * never do more than the user could.
 */
export interface IndustryEdition {
  id: string;
  name: string;
  description: string;
  /** References a template in {@link WEBSITE_TEMPLATES}. */
  websiteTemplateId: string;
  accentColor: string;
  employees: EditionEmployee[];
  /** Premium editions require a plan that unlocks them (Business and up). */
  tier?: MarketplaceTier;
}

const INDUSTRY_EDITIONS: readonly IndustryEdition[] =
  [
    {
      id: "restaurant",
      name: "Restaurant Edition",
      description:
        "A restaurant website, warm brand accent, and assistants for enquiries and reviews.",
      websiteTemplateId:
        "restaurant-classic",
      accentColor: "#c2410c",
      employees: [
        {
          name: "Reservations Assistant",
          title: "Front of House",
          persona:
            "You capture and follow up with diners and reservation enquiries, logging each as a lead. Be warm, prompt, and professional.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "notifications.send",
          ],
        },
        {
          name: "Reviews Responder",
          title: "Guest Relations",
          persona:
            "You summarize guest feedback and draft thoughtful, professional responses. Never invent reviews.",
          toolNames: [
            "notes.add",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "professional-services",
      name: "Professional Services Edition",
      description:
        "A services website, a trustworthy blue accent, and a client-intake team.",
      websiteTemplateId:
        "professional-services",
      accentColor: "#1d4ed8",
      employees: [
        {
          name: "Intake Assistant",
          title: "New Business",
          persona:
            "You qualify inbound enquiries and capture them as leads with clear notes. Be concise and professional.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "notes.add",
          ],
        },
        {
          name: "Engagement Coordinator",
          title: "Client Delivery",
          persona:
            "You help set up client engagements as projects and keep the team informed. Be organized and precise.",
          toolNames: [
            "projects.create",
            "clients.list",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "trades-contractor",
      name: "Trades & Contractor Edition",
      description:
        "A contractor website, strong amber accent, and a quote + job-ticket team.",
      websiteTemplateId:
        "trades-contractor",
      accentColor: "#b45309",
      employees: [
        {
          name: "Quote Coordinator",
          title: "Estimating",
          persona:
            "You capture quote requests as leads, keep their stage current, and alert the team to hot jobs. Be responsive and clear.",
          toolNames: [
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Job Ticket Assistant",
          title: "Operations",
          persona:
            "You open and track support tickets for scheduled jobs and callbacks, and log notes. Be practical and organized.",
          toolNames: [
            "tickets.create",
            "tickets.list",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "fitness",
      name: "Fitness Edition",
      description:
        "A fitness-studio website, energetic green accent, and a membership + support team.",
      websiteTemplateId:
        "fitness-studio",
      accentColor: "#15803d",
      employees: [
        {
          name: "Membership Assistant",
          title: "Front Desk",
          persona:
            "You help prospective members, capture them as leads, and follow up. Be motivating and friendly but professional.",
          toolNames: [
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Facilities Assistant",
          title: "Operations",
          persona:
            "You open support tickets for equipment or facility issues and keep the team informed. Be prompt and clear.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "boutique",
      name: "Boutique Retail Edition",
      description:
        "A boutique storefront, refined pink accent, and a sales + customer-care team.",
      websiteTemplateId:
        "ecommerce-boutique",
      accentColor: "#be185d",
      employees: [
        {
          name: "Sales Assistant",
          title: "Sales",
          persona:
            "You capture interested shoppers and wholesale enquiries as leads and follow up. Be stylish, warm, and professional.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "notifications.send",
          ],
        },
        {
          name: "Customer Care Assistant",
          title: "Customer Care",
          persona:
            "You handle order questions and issues by opening support tickets and logging notes. Be courteous and helpful.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "nonprofit",
      name: "Nonprofit Edition",
      description:
        "A cause-driven website, purple accent, and a donor + volunteer team.",
      websiteTemplateId:
        "nonprofit-cause",
      accentColor: "#7c3aed",
      employees: [
        {
          name: "Donor Relations Assistant",
          title: "Development",
          persona:
            "You capture donor and partner enquiries as leads and log thoughtful notes for follow-up. Be gracious and mission-focused.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "notes.add",
          ],
        },
        {
          name: "Volunteer Coordinator",
          title: "Programs",
          persona:
            "You capture volunteer sign-ups as leads and notify the team. Be encouraging and organized.",
          toolNames: [
            "crm.leads.create",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "real-estate",
      name: "Real Estate Edition",
      description:
        "A listings website, teal accent, and a buyer/seller lead + coordination team.",
      websiteTemplateId: "real-estate",
      accentColor: "#0f766e",
      employees: [
        {
          name: "Lead Assistant",
          title: "Sales",
          persona:
            "You capture buyer and seller enquiries as leads, keep their stage current, and alert the agent to hot prospects. Be responsive and professional.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "crm.pipeline.summary",
            "notifications.send",
          ],
        },
        {
          name: "Showing Coordinator",
          title: "Operations",
          persona:
            "You log showing requests and follow-ups as notes and keep the team informed. Be organized and prompt.",
          toolNames: [
            "notes.add",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "medical-dental",
      name: "Medical & Dental Edition",
      description:
        "A practice website, calm cyan accent, and a patient-intake + support team.",
      websiteTemplateId:
        "medical-dental",
      accentColor: "#0891b2",
      employees: [
        {
          name: "Patient Intake Assistant",
          title: "Front Office",
          persona:
            "You capture new-patient enquiries as leads and log clear notes for the team. Be professional, warm, and discreet; never give medical advice.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "notes.add",
          ],
        },
        {
          name: "Appointment Support",
          title: "Scheduling",
          persona:
            "You open support tickets for appointment requests and rescheduling and notify staff. Be courteous and precise.",
          toolNames: [
            "tickets.create",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "salon-spa",
      name: "Salon & Spa Edition",
      description:
        "A salon/spa website, elegant pink accent, and a booking + client-care team.",
      websiteTemplateId: "salon-spa",
      accentColor: "#db2777",
      employees: [
        {
          name: "Booking Assistant",
          title: "Front Desk",
          persona:
            "You capture booking enquiries as leads and follow up promptly. Be warm, polished, and professional.",
          toolNames: [
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Client Care Assistant",
          title: "Client Care",
          persona:
            "You handle client questions and issues by opening tickets and logging notes. Be gracious and attentive.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "saas-tech",
      name: "SaaS & Technology Edition",
      description:
        "A product landing page, indigo accent, and a sales-qualification + support-triage team.",
      websiteTemplateId: "saas-tech",
      accentColor: "#4f46e5",
      employees: [
        {
          name: "Sales Qualification Assistant",
          title: "Sales",
          persona:
            "You qualify inbound trial and demo requests as leads, advance their stage, and summarize the pipeline. Be crisp, helpful, and product-led.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "crm.pipeline.summary",
          ],
        },
        {
          name: "Support Triage Assistant",
          title: "Customer Success",
          persona:
            "You triage support requests into tickets and keep the team informed. Be clear, calm, and solution-oriented.",
          toolNames: [
            "tickets.list",
            "tickets.create",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "auto-repair",
      name: "Automotive Service Edition",
      description:
        "An auto-shop website, bold red accent, and a service-advisor + follow-up team.",
      websiteTemplateId: "auto-repair",
      accentColor: "#dc2626",
      employees: [
        {
          name: "Service Advisor Assistant",
          title: "Service Desk",
          persona:
            "You capture service requests as leads, open job tickets, and notify the team. Be straightforward, honest, and helpful.",
          toolNames: [
            "crm.leads.create",
            "tickets.create",
            "notifications.send",
          ],
        },
        {
          name: "Estimate Follow-up",
          title: "Sales",
          persona:
            "You follow up on estimates, advance lead stages, and log notes. Be proactive and clear.",
          toolNames: [
            "crm.leads.update_stage",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "education-coaching",
      name: "Education & Coaching Edition",
      description:
        "A programs website, amber accent, and an enrollment + student-support team.",
      websiteTemplateId:
        "education-coaching",
      accentColor: "#ca8a04",
      employees: [
        {
          name: "Enrollment Assistant",
          title: "Admissions",
          persona:
            "You capture prospective students as leads, advance their stage, and follow up on enrollment. Be encouraging and professional.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Student Support",
          title: "Student Success",
          persona:
            "You handle student questions by opening tickets and logging notes. Be supportive and clear.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "church",
      name: "Church & Ministry Edition",
      description:
        "A church website, dignified violet accent, and a connections + care team.",
      websiteTemplateId:
        "church-ministry",
      accentColor: "#5b21b6",
      employees: [
        {
          name: "Connections Assistant",
          title: "Welcome Team",
          persona:
            "You welcome first-time guests and newcomers, capture them as leads, and follow up so no one falls through the cracks. Be warm, personal, and genuine.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "notifications.send",
          ],
        },
        {
          name: "Prayer & Care Assistant",
          title: "Care Team",
          persona:
            "You log prayer requests and care needs as notes, open tickets for follow-up, and alert the care team. Be compassionate, discreet, and prompt.",
          toolNames: [
            "notes.add",
            "tickets.create",
            "notifications.send",
          ],
        },
      ],
    },
    // ── Premium editions (require Business+ plan) ──────────────────────────
    {
      id: "wedding-events",
      name: "Wedding & Events Edition",
      description:
        "A premium venue website, rose accent, and an events-coordination + venue-care team.",
      websiteTemplateId:
        "wedding-events",
      accentColor: "#9d174d",
      tier: "premium",
      employees: [
        {
          name: "Events Coordinator",
          title: "Sales & Events",
          persona:
            "You capture event enquiries as leads, keep their stage current, and alert the team to high-value dates. Be gracious, detail-oriented, and premium in tone.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Venue Care Assistant",
          title: "Operations",
          persona:
            "You track setup requests and day-of details as tickets and notes. Be meticulous and calm.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "boutique-hotel",
      name: "Boutique Hotel Edition",
      description:
        "A premium hotel website, deep-teal accent, and a reservations + guest-services team.",
      websiteTemplateId:
        "boutique-hotel",
      accentColor: "#115e59",
      tier: "premium",
      employees: [
        {
          name: "Reservations Concierge",
          title: "Front Desk",
          persona:
            "You capture stay enquiries as leads and follow up promptly and warmly. Be polished and hospitable.",
          toolNames: [
            "crm.leads.create",
            "crm.leads.update_stage",
            "notifications.send",
          ],
        },
        {
          name: "Guest Services Assistant",
          title: "Guest Experience",
          persona:
            "You handle guest requests and issues via tickets and notes. Be attentive, discreet, and gracious.",
          toolNames: [
            "tickets.create",
            "notes.add",
          ],
        },
      ],
    },
    {
      id: "financial-advisory",
      name: "Financial Advisory Edition",
      description:
        "A premium advisory website, navy accent, and a client-advisory + onboarding team.",
      websiteTemplateId:
        "financial-advisory",
      accentColor: "#1e3a8a",
      tier: "premium",
      employees: [
        {
          name: "Client Advisor Assistant",
          title: "Advisory",
          persona:
            "You qualify prospective clients as leads, advance their stage, and log clear notes. Be professional, precise, and compliant; never give specific investment advice or promise returns.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "notes.add",
          ],
        },
        {
          name: "Onboarding Coordinator",
          title: "Client Onboarding",
          persona:
            "You set up new client engagements as projects and keep the team informed. Be organized and thorough.",
          toolNames: [
            "projects.create",
            "clients.list",
            "notifications.send",
          ],
        },
      ],
    },
    {
      id: "luxury-real-estate",
      name: "Luxury Real Estate Edition",
      description:
        "A premium listings website, bronze accent, and a private-client + listing team.",
      websiteTemplateId:
        "luxury-real-estate",
      accentColor: "#78350f",
      tier: "premium",
      employees: [
        {
          name: "Private Client Assistant",
          title: "Sales",
          persona:
            "You capture buyer and seller enquiries as leads, advance their stage, and summarize the pipeline for the advisor. Be discreet, polished, and responsive.",
          toolNames: [
            "crm.leads.list",
            "crm.leads.create",
            "crm.leads.update_stage",
            "crm.pipeline.summary",
            "notifications.send",
          ],
        },
        {
          name: "Listing Concierge",
          title: "Operations",
          persona:
            "You log showing requests and listing tasks as notes and keep the team informed. Be precise and proactive.",
          toolNames: [
            "notes.add",
            "notifications.send",
          ],
        },
      ],
    },
  ];

export function listIndustryEditions(): readonly IndustryEdition[] {
  return INDUSTRY_EDITIONS;
}

export function getIndustryEdition(
  id: string,
): IndustryEdition | undefined {
  return INDUSTRY_EDITIONS.find(
    (e) => e.id === id,
  );
}
