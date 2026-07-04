import { describe, expect, it } from "vitest";

import { parsePostgresConnectionString } from "./postgres-connection-string";

const REQUIRE_SSL_DSN = [
  "postgres://app_user",
  ":",
  "demo-password",
  "@db.example.com:6432/app_main?sslmode=require&sslnegotiation=direct",
].join("");
const NON_POSTGRES_DSN = [
  "mysql://root",
  ":",
  "demo-password",
  "@localhost/app",
].join("");

describe("parsePostgresConnectionString", () => {
  it("parses a PostgreSQL DSN into form-friendly fields", () => {
    const parsed = parsePostgresConnectionString(REQUIRE_SSL_DSN);

    expect(parsed).toEqual({
      database: "app_main",
      host: "db.example.com",
      password: "demo-password",
      port: 6432,
      sslMode: "require",
      sslNegotiation: "direct",
      username: "app_user",
    });
  });

  it("defaults missing host and sslmode values", () => {
    const parsed = parsePostgresConnectionString("postgres:///querylane");

    expect(parsed).toEqual({
      database: "querylane",
      host: "localhost",
      password: "",
      port: 5432,
      sslMode: "prefer",
      sslNegotiation: "postgres",
      username: "",
    });
  });

  it("returns null for non-PostgreSQL connection strings", () => {
    expect(parsePostgresConnectionString(NON_POSTGRES_DSN)).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parsePostgresConnectionString("postgres://:")).toBeNull();
  });

  it("accepts the postgresql scheme, decoded credentials, and ssl aliases", () => {
    expect(
      parsePostgresConnectionString(
        "postgresql://user%40app:p%40ss@db.example.com/app%2Fmain?sslmode=verify-full"
      )
    ).toMatchObject({
      database: "app/main",
      password: "p@ss",
      sslMode: "verify-full",
      username: "user@app",
    });
    expect(
      parsePostgresConnectionString("postgres://u:p@h/db?sslmode=disable")
        ?.sslMode
    ).toBe("disable");
    expect(
      parsePostgresConnectionString("postgres://u:p@h/db?sslmode=allow")
        ?.sslMode
    ).toBe("allow");
    expect(
      parsePostgresConnectionString("postgres://u:p@h/db?sslmode=verify-ca")
        ?.sslMode
    ).toBe("verify-ca");
  });

  it("rejects out-of-range ports", () => {
    expect(parsePostgresConnectionString("postgres://u:p@h:0/db")).toBeNull();
    expect(
      parsePostgresConnectionString("postgres://u:p@h:70000/db")
    ).toBeNull();
  });

  it("rejects unknown sslnegotiation values", () => {
    expect(
      parsePostgresConnectionString("postgres://u:p@h/db?sslnegotiation=foo")
    ).toBeNull();
  });
});
