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
      unsupportedParameters: [],
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
      unsupportedParameters: [],
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

  it("removes IPv6 URL brackets before populating the host field", () => {
    expect(
      parsePostgresConnectionString(
        "postgres://user:password@[2001:db8::1]:5432/database"
      )
    ).toMatchObject({
      host: "2001:db8::1",
      port: 5432,
    });
  });

  it("surfaces hosted Postgres parameters that Querylane cannot apply", () => {
    expect(
      parsePostgresConnectionString(
        "postgresql://neondb_owner:password@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require&options=project%3Dexample"
      )
    ).toMatchObject({
      database: "neondb",
      host: "ep-example-pooler.us-east-2.aws.neon.tech",
      sslMode: "require",
      unsupportedParameters: ["channel_binding", "options"],
    });
  });

  it.each([
    {
      dsn: "postgresql://postgres.project-ref:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
      expected: {
        database: "postgres",
        host: "aws-0-us-east-1.pooler.supabase.com",
        port: 6543,
        sslMode: "require",
      },
      provider: "Supabase",
    },
    {
      dsn: "postgresql://admin:password@database.cluster-example.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require",
      expected: {
        database: "postgres",
        host: "database.cluster-example.us-east-1.rds.amazonaws.com",
        port: 5432,
        sslMode: "require",
      },
      provider: "RDS",
    },
  ])("parses a stock $provider DSN", ({ dsn, expected }) => {
    expect(parsePostgresConnectionString(dsn)).toMatchObject(expected);
  });

  it("uses the username as PostgreSQL's default database", () => {
    expect(
      parsePostgresConnectionString(
        "postgres://app_user:password@db.example.com"
      )
    ).toMatchObject({
      database: "app_user",
      port: 5432,
    });
  });

  it("maps PostgreSQL's ssl=true URI alias to require", () => {
    expect(
      parsePostgresConnectionString(
        "postgres://app_user:password@db.example.com/database?ssl=true"
      )
    ).toMatchObject({
      sslMode: "require",
      unsupportedParameters: [],
    });
  });

  it("rejects unknown sslmode values instead of silently changing them", () => {
    expect(
      parsePostgresConnectionString(
        "postgres://user:password@db.example.com/database?sslmode=unknown"
      )
    ).toBeNull();
  });

  it.each([
    "postgres://user:password@db.example.com/database?sslmode=disable&sslmode=require",
    "postgres://user:password@db.example.com/database?sslmode=disable&ssl=true",
  ])("rejects ambiguous SSL parameters in %s", (dsn) => {
    expect(parsePostgresConnectionString(dsn)).toBeNull();
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
