import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://leadagent:leadagent@localhost:5432/lead_agent"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional(),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  RESEARCH_PROVIDER: z.enum(["mock", "web"]).default("mock"),
  WEB_SEARCH_PROVIDER: z.enum(["none", "tavily"]).default("none"),
  TAVILY_API_KEY: z.string().optional(),
  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  FETCH_MAX_BYTES: z.coerce.number().int().min(10_000).max(5_000_000).default(1_500_000),
  FETCH_MAX_PAGES: z.coerce.number().int().min(1).max(8).default(4),
  FETCH_USER_AGENT: z.string().default("NovaFlowLeadResearchBot/0.1"),
  LEAD_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(2),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(5000).default(350),
  SHOW_DEMO_CREDENTIALS: z.enum(["true", "false"]).default("false"),
  SEED_ADMIN_EMAIL: z.string().default("admin@novaflow.demo"),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    const blanksRemoved = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    cached = EnvSchema.parse(blanksRemoved);
  }
  return cached;
}

export function resetConfigCache() {
  cached = null;
}
