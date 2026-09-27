/**
 * DEMO FIXTURES — fictional companies used by MockResearchProvider.
 * None of this is real research. Every value produced from these fixtures is
 * labelled source_type "demo" / label "demo" throughout the application.
 * Domains use the reserved ".example" TLD (RFC 2606) so they can never resolve.
 */
import type { WebsiteAnalysis } from "../domain/website";
import type { OperationalSignalKey } from "../domain/profile";

export interface DemoCompany {
  key: string;
  expected_outcome: string;
  company_name: string;
  website: string;
  contact: { name: string; email: string; title: string };
  facts: {
    description: string;
    industry: string;
    size: { label: string; min: number; max: number };
    business_model: "B2B" | "B2C" | "B2B2C" | "Marketplace";
    country: string;
    locations: string[];
    services: string[];
    products?: string[];
    target_customers: string[];
  };
  site: Omit<WebsiteAnalysis, "url" | "source_type" | "fetched_at" | "pages" | "robots_allowed" | "errors" | "text_sample">;
  extra_operational: { key: OperationalSignalKey; description: string; statement: string }[];
  news: { statement: string; category: string; strength: "strong" | "moderate" | "weak"; signal: string; confidence: number; days_ago: number }[];
}

const empty = { products: [] as string[], booking_indicators: [] as string[], ecommerce_indicators: [] as string[], chat_indicators: [] as string[], whatsapp_links: [] as string[], hiring_mentions: [] as string[] };

export const DEMO_COMPANIES: DemoCompany[] = [
  {
    key: "example-logistics",
    expected_outcome: "Strong fit, strong buying signals",
    company_name: "Example Logistics",
    website: "https://examplelogistics.example",
    contact: { name: "Dana Whitfield", email: "dana.whitfield@examplelogistics.example", title: "VP of Operations" },
    facts: {
      description: "Regional freight forwarding and warehousing provider serving retailers and manufacturers in the southern United States.",
      industry: "logistics",
      size: { label: "51-200", min: 51, max: 200 },
      business_model: "B2B",
      country: "United States",
      locations: ["Dallas, TX", "Memphis, TN", "Atlanta, GA"],
      services: ["Freight forwarding", "LTL and FTL transportation", "Warehousing", "Last-mile delivery"],
      target_customers: ["Regional retailers", "Manufacturers"],
    },
    site: {
      ...empty,
      title: "Example Logistics | Freight Forwarding & Warehousing",
      meta_description: "Freight forwarding, LTL/FTL trucking and warehousing across Texas, Tennessee and Georgia. Request a freight quote online.",
      headings: ["Freight that moves on schedule", "Our services", "Request a freight quote", "Locations"],
      services: ["Freight forwarding", "LTL and FTL transportation", "Warehousing", "Last-mile delivery"],
      contact: { emails: ["quotes@examplelogistics.example", "support@examplelogistics.example"], phones: ["+1 (214) 555-0147"] },
      ctas: ["Request a Freight Quote", "Track Shipment", "Call Dispatch"],
      forms: [
        { purpose: "quote", fields_count: 9, page_url: "https://examplelogistics.example/quote" },
        { purpose: "contact", fields_count: 4, page_url: "https://examplelogistics.example/contact" },
      ],
      technologies: [
        { name: "HubSpot", category: "crm", evidence: "HubSpot forms script (demo)" },
        { name: "WordPress", category: "cms", evidence: "wp-content paths (demo)" },
      ],
      hiring_mentions: ["Customer Service Representative", "Operations Coordinator"],
      location_mentions: ["Dallas, TX", "Memphis, TN", "Atlanta, GA"],
    },
    extra_operational: [
      { key: "high_inquiry_volume", description: "Quote desk handles requests by form, email and phone", statement: "The quote page says requests are reviewed by the quote desk and answered by email or phone." },
    ],
    news: [
      { statement: "Announcement of a new cross-dock facility in Atlanta, GA.", category: "location_expansion", strength: "strong", signal: "Expanding to a new location", confidence: 0.8, days_ago: 21 },
    ],
  },
  {
    key: "meridian-health-admin",
    expected_outcome: "Strong fit",
    company_name: "Meridian Health Admin Partners",
    website: "https://meridianhealthadmin.example",
    contact: { name: "Angela Brooks", email: "angela.brooks@meridianhealthadmin.example", title: "Director of Client Services" },
    facts: {
      description: "Outsourced medical billing, credentialing and prior-authorization support for independent clinics.",
      industry: "healthcare administration",
      size: { label: "51-200", min: 51, max: 200 },
      business_model: "B2B",
      country: "United States",
      locations: ["Phoenix, AZ", "Denver, CO"],
      services: ["Medical billing", "Provider credentialing", "Prior authorization support", "Patient scheduling support"],
      target_customers: ["Independent medical practices", "Outpatient clinics"],
    },
    site: {
      ...empty,
      title: "Meridian Health Admin Partners | Billing & Credentialing",
      meta_description: "Medical billing, credentialing and prior authorization support for independent practices.",
      headings: ["Revenue cycle support for independent practices", "Services", "Client portal"],
      services: ["Medical billing", "Provider credentialing", "Prior authorization support", "Patient scheduling support"],
      contact: { emails: ["billing@meridianhealthadmin.example", "info@meridianhealthadmin.example"], phones: ["+1 (602) 555-0181"] },
      ctas: ["Request a Consultation", "Client Portal Login", "Submit a Ticket"],
      forms: [{ purpose: "contact", fields_count: 6, page_url: "https://meridianhealthadmin.example/contact" }],
      technologies: [
        { name: "Salesforce", category: "crm", evidence: "Salesforce web-to-lead form (demo)" },
        { name: "Zendesk", category: "helpdesk", evidence: "Zendesk help-center link (demo)" },
      ],
      hiring_mentions: ["Revenue Cycle Specialist"],
      location_mentions: ["Phoenix, AZ", "Denver, CO"],
    },
    extra_operational: [
      { key: "repetitive_admin", description: "Core services are recurring administrative workflows", statement: "Listed services (billing, credentialing, prior authorizations) are recurring administrative processes." },
    ],
    news: [],
  },
  {
    key: "harbor-realty",
    expected_outcome: "Strong fit, weak buying signals",
    company_name: "Harbor Realty Group",
    website: "https://harborrealtygroup.example",
    contact: { name: "Marcus Ortega", email: "marcus@harborrealtygroup.example", title: "Broker/Owner" },
    facts: {
      description: "Residential brokerage and property management firm on Florida's Gulf Coast.",
      industry: "real estate",
      size: { label: "11-50", min: 11, max: 50 },
      business_model: "B2C",
      country: "United States",
      locations: ["Tampa, FL", "St. Petersburg, FL"],
      services: ["Residential sales", "Property management", "Rental leasing"],
      target_customers: ["Home buyers and sellers", "Property owners"],
    },
    site: {
      ...empty,
      title: "Harbor Realty Group | Tampa Bay Homes & Property Management",
      meta_description: "Buy, sell or rent in Tampa Bay. Schedule a showing online or message us on WhatsApp.",
      headings: ["Find your place on the Bay", "Featured listings", "Property management"],
      services: ["Residential sales", "Property management", "Rental leasing"],
      contact: { emails: ["hello@harborrealtygroup.example"], phones: ["+1 (813) 555-0122"] },
      ctas: ["Schedule a Showing", "Message us on WhatsApp", "Call the Office"],
      forms: [{ purpose: "contact", fields_count: 5, page_url: "https://harborrealtygroup.example/contact" }],
      booking_indicators: ["Calendly embed for showings (demo)"],
      whatsapp_links: ["https://wa.me/18135550122"],
      technologies: [
        { name: "Calendly", category: "booking_system", evidence: "Calendly embed (demo)" },
        { name: "WordPress", category: "cms", evidence: "wp-content paths (demo)" },
      ],
      location_mentions: ["Tampa, FL", "St. Petersburg, FL"],
    },
    extra_operational: [],
    news: [
      { statement: "Listings page shows a newly added short-term rental management page.", category: "new_service_launch", strength: "weak", signal: "Possible new service line", confidence: 0.4, days_ago: 45 },
    ],
  },
  {
    key: "brightcart",
    expected_outcome: "Medium fit",
    company_name: "Brightcart Home Goods",
    website: "https://brightcart.example",
    contact: { name: "Priya Nair", email: "priya.nair@brightcart.example", title: "Marketing Coordinator" },
    facts: {
      description: "Direct-to-consumer online store for home and kitchen goods.",
      industry: "ecommerce",
      size: { label: "201-500", min: 201, max: 500 },
      business_model: "B2C",
      country: "Canada",
      locations: ["Toronto, ON"],
      services: ["Online retail"],
      products: ["Cookware", "Storage", "Home textiles"],
      target_customers: ["Consumers in Canada and the US"],
    },
    site: {
      ...empty,
      title: "Brightcart | Home & Kitchen Goods",
      meta_description: "Cookware, storage and textiles shipped across Canada and the US.",
      headings: ["New arrivals", "Shop by room", "Help centre"],
      services: [],
      products: ["Cookware", "Storage", "Home textiles"],
      contact: { emails: ["support@brightcart.example"], phones: [] },
      ctas: ["Shop Now", "Add to Cart", "Track Order"],
      forms: [{ purpose: "newsletter", fields_count: 1, page_url: "https://brightcart.example/" }],
      ecommerce_indicators: ["Cart and checkout (demo)"],
      chat_indicators: ["Gorgias chat widget (demo)"],
      technologies: [
        { name: "Shopify", category: "ecommerce_platform", evidence: "Shopify CDN (demo)" },
        { name: "Gorgias", category: "helpdesk", evidence: "Gorgias widget (demo)" },
        { name: "Klaviyo", category: "marketing_automation", evidence: "Klaviyo script (demo)" },
      ],
      location_mentions: ["Toronto, ON"],
    },
    extra_operational: [],
    news: [
      { statement: "Launch of a new outdoor-living product collection.", category: "product_launch", strength: "moderate", signal: "Recent product launch", confidence: 0.6, days_ago: 30 },
    ],
  },
  {
    key: "ledgerline",
    expected_outcome: "Strong ICP fit, below target size — medium lead score",
    company_name: "Ledgerline Advisory",
    website: "https://ledgerline.example",
    contact: { name: "Samuel Okafor", email: "sam@ledgerline.example", title: "Managing Partner" },
    facts: {
      description: "Bookkeeping and tax advisory practice for small businesses.",
      industry: "professional services",
      size: { label: "1-10", min: 1, max: 10 },
      business_model: "B2B",
      country: "United States",
      locations: ["Columbus, OH"],
      services: ["Bookkeeping", "Tax preparation", "Payroll advisory"],
      target_customers: ["Small businesses"],
    },
    site: {
      ...empty,
      title: "Ledgerline Advisory | Bookkeeping & Tax",
      meta_description: "Monthly bookkeeping and tax preparation for small businesses in Ohio.",
      headings: ["Books closed on time, every month", "Services", "Book a call"],
      services: ["Bookkeeping", "Tax preparation", "Payroll advisory"],
      contact: { emails: ["hello@ledgerline.example"], phones: ["+1 (614) 555-0199"] },
      ctas: ["Book a Call", "Contact Us"],
      forms: [{ purpose: "contact", fields_count: 4, page_url: "https://ledgerline.example/contact" }],
      booking_indicators: ["Calendly booking link (demo)"],
      technologies: [{ name: "Calendly", category: "booking_system", evidence: "Calendly link (demo)" }],
      location_mentions: ["Columbus, OH"],
    },
    extra_operational: [],
    news: [],
  },
  {
    key: "ironvale",
    expected_outcome: "Poor fit",
    company_name: "Ironvale Steelworks",
    website: "https://ironvale.example",
    contact: { name: "Klaus Berger", email: "k.berger@ironvale.example", title: "Plant Engineer" },
    facts: {
      description: "Industrial steel fabrication and heavy machining for the automotive and energy sectors.",
      industry: "manufacturing",
      size: { label: "1001-5000", min: 1001, max: 5000 },
      business_model: "B2B",
      country: "Germany",
      locations: ["Duisburg", "Dortmund"],
      services: ["Steel fabrication", "Heavy machining"],
      target_customers: ["Automotive OEMs", "Energy companies"],
    },
    site: {
      ...empty,
      title: "Ironvale Steelworks | Fabrication & Machining",
      meta_description: "Steel fabrication and heavy machining for automotive and energy.",
      headings: ["Engineering in steel", "Capabilities", "Certifications"],
      services: ["Steel fabrication", "Heavy machining"],
      contact: { emails: ["info@ironvale.example"], phones: [] },
      ctas: ["Contact Sales"],
      forms: [],
      technologies: [{ name: "SAP", category: "erp", evidence: "SAP supplier portal link (demo)" }],
      location_mentions: ["Duisburg", "Dortmund"],
    },
    extra_operational: [],
    news: [],
  },
];

export function findDemoCompany(name: string, website?: string | null): DemoCompany | undefined {
  const n = name.trim().toLowerCase();
  const host = website ? safeHost(website) : null;
  return DEMO_COMPANIES.find((c) => c.company_name.toLowerCase() === n || (host !== null && safeHost(c.website) === host));
}

function safeHost(u: string): string | null {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
