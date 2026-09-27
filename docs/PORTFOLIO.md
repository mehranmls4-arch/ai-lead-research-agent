# Portfolio notes

This is the third project in a portfolio series (after an AI customer support agent
and a WhatsApp AI sales agent). It's built for a fictional company, NovaFlow AI, and
is not connected to any real client, deployment, or user base — everything below is
about the engineering, not about business outcomes.

## What I built

A lead-research agent that takes a company name and produces an evidence-backed
dossier: a structured profile, ICP fit, buying signals, pain-point hypotheses,
automation opportunities, a transparent lead score, and draft outreach — with a human
approval gate before anything is considered ready to send. It's a full application
(Next.js, PostgreSQL, auth, CRM, CSV import, analytics), not a script or a notebook.

## Why it matters

Most "AI lead gen" demos either fabricate research to look impressive, or hide the
scoring logic behind an opaque model call that can't be explained to a salesperson.
This project deliberately does neither: research either has a real source or the
field is left empty; scoring is nine inspectable weighted factors, not a single
model-produced number; and every AI-generated claim is validated by deterministic
code before a human ever sees it framed as ready to use.

## AI engineering techniques demonstrated

- **Tool-calling agent orchestration**: an 11-tool pipeline with explicit
  prerequisites, where the model chooses the next tool from only the ones currently
  eligible, and a deterministic fallback takes over if the model's choice is missing,
  unavailable, or malformed.
- **Structured outputs with citation requirements**: every LLM-filled profile field
  must cite an evidence id from the supplied input or it's rejected — the model
  cannot state a fact that isn't traceable to something the system actually observed.
- **Provider abstraction**: `AIProvider` and `ResearchProvider` are interfaces with a
  mock and a real implementation each, selected purely by configuration; the agent
  and every downstream consumer are unaware of which is active.
- **Graceful degradation under model failure**: a failed structured-output call
  doesn't crash the pipeline — profile extraction falls back to the deterministic,
  evidence-only profile; the summary falls back to a deterministic template; outreach
  generation is skipped with a stated reason. The full pipeline still reaches a
  terminal state either way (covered by dedicated planner-fallback tests).
- **Deterministic business logic kept separate from the model**: ICP matching, lead
  scoring, buying-signal validation, pain-point validation, outreach validation and
  CRM transition rules are all plain TypeScript functions with no model call inside
  them — inspectable, unit-testable, and reproducible.

## Provenance and confidence as first-class data

Every fact in the system — not just research output, but signals, pain points, and
opportunities — carries a `Provenance` object with a source, an optional URL, a
confidence score, a retrieval timestamp, and one of six labels (Verified,
Source-backed, Estimated, Inferred, Demo, Potential). Demo data is *forced* to the
Demo label at the schema level, so a mock provider cannot present itself as real
research even by accident.

## ICP matching and lead scoring: deterministic, not model-scored

Both are pure functions over the profile and the configured weights. This was a
deliberate choice: a lead score that a salesperson can't get an explanation for is a
lead score they won't trust. Every factor shows its weight, its earned score, its
evidence, and a one-line explanation, and the factors always sum to the total.

## Human-in-the-loop design

The CRM transition rules (`src/lib/engine/crm.ts`) are the actual enforcement
mechanism, not a UI convention: the AI is only permitted to move a lead through
research-related stages (New → Researching → Qualified/Needs review → Outreach
drafted). Approving outreach, marking it sent, and every stage from Contacted onward
— including Won and Lost — require a human action and go through `changeStage`,
which checks the same transition table. There's no code path where the agent can
mark a deal Won or send an email itself; there's no email-sending code at all.

## Security considerations

SSRF protection is the security work I'd call out specifically: hostname validation,
private/loopback/link-local/reserved-range blocking for both IPv4 and IPv6, cloud
metadata address blocking, DNS-rebinding protection (re-checking resolved addresses,
not just the literal hostname), redirect-chain re-validation on every hop, and
content-type/size/timeout limits on the fetch itself. This is tested directly (32
security tests, 14 fetch-behavior tests) and was also exercised against a real public
page during final validation.

## Testing strategy

185 tests across 17 files, organized by what they actually validate rather than by
file structure convenience:

- **Pure logic** (ICP, scoring, signals, pain points, outreach validation, CSV, CRM
  transitions) — fast, no I/O, the bulk of the suite.
- **Mocked-boundary tests** for both external adapters (OpenAI-compatible chat
  completions, Tavily search) and for the website fetcher — request construction,
  response parsing, and failure handling, all without calling a real API.
- **Security tests** for the SSRF/URL-validation logic specifically, including
  adversarial cases like DNS rebinding and encoded-IP hostnames.
- **Agent-level tests**: tool schema validation, and a dedicated planner-fallback
  suite that deliberately breaks the AI provider's tool choice in five different ways
  and asserts the pipeline still completes.
- **Integration tests** against a real, separate PostgreSQL database
  (`TEST_DATABASE_URL`, truncated between tests, never the same database used for
  the seeded demo) covering the full run-to-persistence path, outreach approval, CRM
  stage enforcement, and CSV import.
- **API route tests** exercising the actual Next.js route handler functions with a
  mocked session, covering authorization boundaries (member vs. admin, unauthenticated
  vs. authenticated) and key business-rule rejections.
- **Middleware tests** against the real middleware function with constructed
  `NextRequest` objects, covering session verification and the CSRF origin check.

The one live external test performed is a single fetch of `https://github.com/about`
through the real website-fetch adapter — the only host reachable from this build
environment's network policy. It surfaced and led to fixing one real bug (a
self-referencing "interesting path" page being crawled twice).

## Mock vs. real provider architecture

The mock providers aren't a simplified stand-in bolted on separately — they implement
the exact same interface the real providers do, so the entire pipeline, every
engine, and the whole UI are identical in mock and real mode. The only observable
difference is the `demo` provenance label. This means the demo shown in `docs/DEMO.md`
exercises the real code path end-to-end, not a separate demo-only branch.

## Known limitations

- The OpenAI-compatible and Tavily adapters are implemented and covered by
  mocked-HTTP tests only; they have not been called against a real OpenAI or Tavily
  API key in this repository.
- The queue is in-process (`SKIP LOCKED` polling against PostgreSQL), which is
  appropriate for a single-instance app but would need a real job runner for a
  multi-instance deployment.
- The website-fetch provider follows a small set of "interesting path" links from the
  homepage; it's not a general crawler.
- There is no email-sending integration by design — outreach approval ends at a
  human manually sending the message and recording that fact.
