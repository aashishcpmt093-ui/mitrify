import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDatabaseUrl, missingParts } from "../dbEnv";

const parts = { PGHOST: "ep-abc-123.ap-southeast-1.aws.neon.tech", PGUSER: "app_user", PGPASSWORD: "p@ss:w/rd#1?&%", PGDATABASE: "neondb" };

describe("database settings from parts", () => {
  it("builds a link whose user and password survive special characters", () => {
    const url = buildDatabaseUrl(parts)!;
    const u = new URL(url);
    assert.equal(u.protocol, "postgresql:");
    assert.equal(u.hostname, parts.PGHOST);
    assert.equal(decodeURIComponent(u.username), "app_user");
    assert.equal(decodeURIComponent(u.password), parts.PGPASSWORD);
    assert.equal(u.pathname, "/neondb");
    assert.equal(u.searchParams.get("sslmode"), "require");
    assert.equal(u.port, "5432");
  });
  it("DATABASE_URL always wins", () => {
    assert.equal(buildDatabaseUrl({ ...parts, DATABASE_URL: "postgresql://x" }), null);
  });
  it("needs all four values and names only the missing ones", () => {
    assert.equal(buildDatabaseUrl({ PGHOST: "h", PGUSER: "u", PGDATABASE: "d" }), null);
    assert.deepEqual(missingParts({ PGHOST: "h", PGUSER: "u", PGDATABASE: "d" }), ["PGPASSWORD"]);
    assert.deepEqual(missingParts({}), []);
    assert.deepEqual(missingParts({ DATABASE_URL: "x", PGHOST: "h" }), []);
  });
  it("refuses values that could reshape the link", () => {
    assert.equal(buildDatabaseUrl({ ...parts, PGHOST: "evil.example/db?x=" }), null);
    assert.equal(buildDatabaseUrl({ ...parts, PGHOST: "a@evil.example" }), null);
    assert.equal(buildDatabaseUrl({ ...parts, PGPORT: "5432/x" }), null);
    assert.equal(buildDatabaseUrl({ ...parts, PGSSLMODE: "require&x=1" }), null);
  });
  it("honours port and sslmode when given", () => {
    const u = new URL(buildDatabaseUrl({ ...parts, PGPORT: "5433", PGSSLMODE: "disable" })!);
    assert.equal(u.port, "5433");
    assert.equal(u.searchParams.get("sslmode"), "disable");
  });
});
