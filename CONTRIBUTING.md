# Contributing

This is a portfolio project, but it's built and tested like a real one. If you're
poking around, extending it, or using it as a reference, here's how the pieces fit
together.

## Setup

```bash
git clone <this-repo>
cd ai-lead-research-agent
npm install
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — your local PostgreSQL connection string.
- `TEST_DATABASE_URL` — a **separate** database for integration tests. Never point
  this at the same database as `DATABASE_URL`; the test suite truncates every table
  in it between tests.
- `SESSION_SECRET` — at least 32 random characters
  (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `SEED_ADMIN_PASSWORD` — the password for the admin account `npm run db:seed`
  creates.

Leave `AI_PROVIDER=mock` and `RESEARCH_PROVIDER=mock` unless you're specifically
testing a real provider integration — the whole app, including the demo, works fully
in mock mode with no external API calls.

## Database

```bash
npm run db:migrate    # apply migrations to DATABASE_URL
npm run db:seed       # admin/member users, default ICP, demo companies
```

Schema changes go in `src/lib/db/schema.ts`; generate a migration with
`npm run db:generate` (drizzle-kit) and commit the generated SQL under `drizzle/`.

`npm run db:reset` drops and recreates the schema against `DATABASE_URL`, then
migrates and seeds again. It refuses to run when `NODE_ENV=production`. Use it
freely in development; never point it at a database you care about.

## Tests

```bash
npm test
```

Runs the full suite (185 tests) against `TEST_DATABASE_URL` for the integration
tests and in-memory/mocked everything else. Before adding a new integration test,
migrate the test database once:

```bash
npx tsx scripts/migrate.ts --test
```

When adding tests:

- Pure logic (an engine function, a schema, a validator) → a plain unit test, no
  database.
- Anything that touches PostgreSQL → add it to `tests/integration-db.test.ts` or a
  new file that imports `tests/db-setup.ts`'s `resetTestDb()`, which truncates the
  test database's tables before each test. Never write a test that could touch
  `DATABASE_URL`.
- A new API route → follow the pattern in `tests/api-routes.test.ts` (mock
  `@/lib/auth/server`, repoint `DATABASE_URL` at `TEST_DATABASE_URL` for that file
  only, call the route handler function directly with a constructed `Request`).

## Lint and typecheck

```bash
npm run lint
npx tsc --noEmit
```

Both must pass with zero warnings/errors before a change is considered done. Don't
add `eslint-disable` comments to work around a real issue — fix the issue.

## Build

```bash
npm run build
```

Must complete without errors. If you change route signatures, environment variable
names, or anything `next build` type-checks statically, run this before committing.

## Adding a new agent tool

1. Add the name to `TOOL_NAMES` in `src/lib/agent/types.ts`.
2. Define it in `TOOLS` in `src/lib/agent/tools.ts`: a Zod `args` schema, its
   `requires` (which earlier tools must have run), a `status` (which `ResearchStatus`
   it corresponds to), and a `run` function that returns `{ status, summary }`.
2. If it calls `deps.ai.generateStructured`, wrap the call so a provider failure
   degrades gracefully (see how `extract_profile` and `generate_outreach` do it)
   rather than throwing out of the tool.
3. Add coverage in `tests/agent-tools.test.ts` (schema validation) and, if it changes
   pipeline behavior meaningfully, exercise it via `tests/helpers.ts`'s `runFixture`
   in a new or existing fixture-based test.

## Pull requests

- Keep changes focused; a PR that touches the engine, the UI and the schema at once
  is hard to review.
- Include the exact commands you ran (`npm test`, `npm run lint`,
  `npx tsc --noEmit`, `npm run build`) and their results in the PR description.
- If you touch the ICP or scoring weights, update `DEFAULT_ICP` in
  `src/lib/domain/icp.ts` and the corresponding tests together — they're checked
  against each other.
- Never commit `.env`, real API keys, or anything under `TEST_DATABASE_URL`/
  `DATABASE_URL` credentials that aren't the local development defaults.
