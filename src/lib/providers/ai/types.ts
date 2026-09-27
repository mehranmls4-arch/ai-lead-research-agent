import type { z } from "zod";

export type AITask = "extract_profile" | "generate_outreach" | "summarize_lead";

export interface StructuredRequest<T> {
  task: AITask;
  instructions: string;
  input: unknown;
  schema: z.ZodType<T>;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolChoiceRequest {
  goal: string;
  state: string; // safe, non-sensitive summary of progress so far
  tools: ToolSpec[];
}

export interface ToolChoice {
  name: string;
  arguments: Record<string, unknown>;
}

/** Vendor-neutral AI interface. Swap implementations via AI_PROVIDER. */
export interface AIProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
  chooseNextTool(req: ToolChoiceRequest): Promise<ToolChoice | null>;
}

export class AIProviderError extends Error {}
