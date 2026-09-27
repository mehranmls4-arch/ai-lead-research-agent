import { z } from "zod";
import type { AIProvider, StructuredRequest, ToolChoice, ToolChoiceRequest } from "./types";
import { AIProviderError } from "./types";

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM = [
  "You are a B2B research assistant for NovaFlow AI.",
  "Use ONLY the evidence provided in the input. Never invent facts, metrics, technologies, names or dates.",
  "Every field you return must cite evidence ids from the input. If evidence is insufficient, return null for that field.",
  "Describe hypotheses with hedged language (potential, possible, indication).",
  "Return only JSON that matches the provided schema.",
].join(" ");

function toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/**
 * Adapter for any OpenAI-compatible Chat Completions endpoint (OpenAI, Azure-compatible
 * gateways, OpenRouter, local servers). Uses JSON-schema structured outputs and tool calling.
 * Exercised with mocked HTTP in tests; not live-tested in this repository.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly isMock = false;
  private readonly f: typeof fetch;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    if (!opts.apiKey) throw new AIProviderError("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    this.name = `openai-compatible:${opts.model}`;
    this.f = opts.fetchImpl ?? fetch;
  }

  private async call(body: Record<string, unknown>): Promise<{ choices: { message: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 45_000);
    try {
      const res = await this.f(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.apiKey}` },
        body: JSON.stringify({ model: this.opts.model, temperature: 0.2, ...body }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Never echo the response body: it may contain request details. Status is enough.
        throw new AIProviderError(`AI provider returned HTTP ${res.status}`);
      }
      return (await res.json()) as never;
    } catch (e) {
      if (e instanceof AIProviderError) throw e;
      throw new AIProviderError(controller.signal.aborted ? "AI provider request timed out" : "AI provider request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const data = await this.call({
      messages: [
        { role: "system", content: `${SYSTEM}\n\nTask: ${req.instructions}` },
        { role: "user", content: JSON.stringify(req.input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.task, schema: toJsonSchema(req.schema as z.ZodType<unknown>), strict: false },
      },
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new AIProviderError("AI provider returned no content");
    let json: unknown;
    try {
      json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new AIProviderError("AI provider returned invalid JSON");
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new AIProviderError(`AI output failed schema validation for ${req.task}`);
    return parsed.data;
  }

  async chooseNextTool(req: ToolChoiceRequest): Promise<ToolChoice | null> {
    if (!req.tools.length) return null;
    const data = await this.call({
      messages: [
        {
          role: "system",
          content:
            "You orchestrate a lead-research pipeline. Call exactly one of the available tools to make progress toward the goal. Prefer gathering evidence before evaluating it.",
        },
        { role: "user", content: `Goal: ${req.goal}\n\nProgress so far:\n${req.state}` },
      ],
      tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "required",
      parallel_tool_calls: false,
    });
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      args = {};
    }
    return { name: call.function.name, arguments: args };
  }
}
