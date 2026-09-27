import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAICompatibleProvider } from "@/lib/providers/ai/openai";
import { AIProviderError } from "@/lib/providers/ai/types";

/**
 * These tests exercise the adapter's request construction and response handling entirely
 * against a mocked fetch. The real OpenAI/OpenAI-compatible API is never called — the
 * adapter is implemented and mocked-tested here, not live-tested.
 */
const schema = z.object({ description: z.string().nullable() });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenAICompatibleProvider — request construction", () => {
  it("requires an API key", () => {
    expect(() => new OpenAICompatibleProvider({ apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" })).toThrow(AIProviderError);
  });

  it("posts to <baseUrl>/chat/completions with bearer auth, model, system+user messages and a json_schema response_format", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ description: "A logistics company" }) } }] });
    }) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1/", model: "gpt-4o-mini", fetchImpl });
    const out = await p.generateStructured({ task: "extract_profile", instructions: "Fill the description.", input: { evidence: ["e1"] }, schema });
    expect(out).toEqual({ description: "A logistics company" });
    expect(captured!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Task: Fill the description.");
    expect(body.messages[1]).toEqual({ role: "user", content: JSON.stringify({ evidence: ["e1"] }) });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("extract_profile");
    expect(body.response_format.json_schema.schema.properties.description).toBeDefined();
    const headers = new Headers(captured!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("strips markdown code fences from the model's JSON content", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: { content: '```json\n{"description":"Fenced"}\n```' } }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    const out = await p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema });
    expect(out).toEqual({ description: "Fenced" });
  });

  it("rejects a response with no content", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: {} }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    await expect(p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema })).rejects.toThrow(/no content/);
  });

  it("rejects malformed JSON content", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: { content: "not json" } }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    await expect(p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema })).rejects.toThrow(/invalid JSON/);
  });

  it("rejects content that fails the requested schema", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: { content: JSON.stringify({ description: 123 }) } }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    await expect(p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema })).rejects.toThrow(/schema validation/);
  });

  it("turns a non-2xx HTTP response into a provider error without leaking the body", async () => {
    const fetchImpl = (async () => new Response("secret internal detail", { status: 500 })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    const err = await p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema }).catch((e) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(String(err.message)).toMatch(/HTTP 500/);
    expect(String(err.message)).not.toMatch(/secret internal detail/);
  });

  it("propagates a timeout as a provider error", async () => {
    const fetchImpl = (async (_u, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", timeoutMs: 50, fetchImpl });
    await expect(p.generateStructured({ task: "extract_profile", instructions: "x", input: {}, schema })).rejects.toThrow(/timed out/);
  });

  it("sends tool_choice=required with the tool list and parses a returned tool call", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u, init) => {
      body = JSON.parse(init!.body as string);
      return jsonResponse({ choices: [{ message: { tool_calls: [{ function: { name: "match_icp", arguments: "{}" } }] } }] });
    }) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    const choice = await p.chooseNextTool({ goal: "g", state: "s", tools: [{ name: "match_icp", description: "d", parameters: { type: "object" } }] });
    expect(choice).toEqual({ name: "match_icp", arguments: {} });
    expect(body.tool_choice).toBe("required");
    expect(body.parallel_tool_calls).toBe(false);
    expect((body.tools as { function: { name: string } }[])[0].function.name).toBe("match_icp");
  });

  it("returns null instead of throwing when no tool call comes back or tools list is empty", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: { content: "I decline to call a tool" } }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    expect(await p.chooseNextTool({ goal: "g", state: "s", tools: [] })).toBeNull();
    expect(await p.chooseNextTool({ goal: "g", state: "s", tools: [{ name: "x", description: "d", parameters: {} }] })).toBeNull();
  });

  it("tolerates malformed tool-call arguments by returning an empty object", async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [{ message: { tool_calls: [{ function: { name: "match_icp", arguments: "{not json" } }] } }] })) as typeof fetch;
    const p = new OpenAICompatibleProvider({ apiKey: "sk-test", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", fetchImpl });
    const choice = await p.chooseNextTool({ goal: "g", state: "s", tools: [{ name: "match_icp", description: "d", parameters: {} }] });
    expect(choice).toEqual({ name: "match_icp", arguments: {} });
  });
});
