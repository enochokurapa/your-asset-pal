import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const compose = readFileSync("standalone.compose.yml", "utf8");
const initialSchema = readFileSync("complete_init.sql", "utf8");

test("production deployment requires private database and JWT credentials", () => {
  for (const variable of [
    "ASSETFLOW_DB_PASSWORD",
    "ASSETFLOW_JWT_SECRET",
    "ASSETFLOW_SERVICE_ROLE_JWT",
    "ASSETFLOW_ANON_JWT",
  ]) {
    expect(compose).toContain("${" + variable + ":?");
  }
});

test("no default database or JWT signing password is bundled with deployment", () => {
  expect(compose).not.toMatch(/super-secret-(?:postgres|jwt)/);
  expect(initialSchema).not.toMatch(/super-secret-(?:postgres|jwt)/);
  expect(initialSchema).toContain("ASSETFLOW_DB_PASSWORD");
  expect(initialSchema).toContain("current_setting('assetflow.init_password')");
});

test("privileged service tokens come from runtime configuration, not literal JWTs", () => {
  expect(compose).not.toContain('SUPABASE_SERVICE_ROLE_KEY: "eyJ');
  expect(compose).toContain("ASSETFLOW_SERVICE_ROLE_JWT");
});
