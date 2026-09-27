import { config } from "dotenv";
config({ quiet: true });
// Unit tests need a signing secret; integration tests use TEST_DATABASE_URL (never DATABASE_URL).
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
