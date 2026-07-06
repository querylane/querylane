import { describe, expect, test } from "vitest";
import { parsePostgresPlatform } from "@/lib/postgres-platform";

describe("parsePostgresPlatform", () => {
  test("parses a musl linux triple", () => {
    expect(
      parsePostgresPlatform(
        "PostgreSQL 17.9 on aarch64-unknown-linux-musl, compiled by gcc (Alpine 14.2.0) 14.2.0, 64-bit"
      )
    ).toEqual({ arch: "aarch64", os: "linux" });
  });

  test("parses a gnu linux triple", () => {
    expect(
      parsePostgresPlatform(
        "PostgreSQL 15.4 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 8.5.0, 64-bit"
      )
    ).toEqual({ arch: "x86_64", os: "linux" });
  });

  test("parses an apple darwin triple as macos", () => {
    expect(
      parsePostgresPlatform(
        "PostgreSQL 16.2 on aarch64-apple-darwin23.4.0, compiled by Apple clang version 15.0.0"
      )
    ).toEqual({ arch: "aarch64", os: "macos" });
  });

  test("parses a mingw triple as windows", () => {
    expect(
      parsePostgresPlatform(
        "PostgreSQL 14.1 on x86_64-w64-mingw32, compiled by msvc-19.29.30040, 64-bit"
      )
    ).toEqual({ arch: "x86_64", os: "windows" });
  });

  test("returns null when no target triple is present", () => {
    expect(
      parsePostgresPlatform(
        "PostgreSQL 16.1, compiled by Visual C++ build 1937, 64-bit"
      )
    ).toBeNull();
  });

  test("returns null when the triple has no recognizable os segment", () => {
    expect(
      parsePostgresPlatform("PostgreSQL 16.1 on sparc64-sun-unknown")
    ).toBeNull();
  });

  test("returns null for empty or missing input", () => {
    expect(parsePostgresPlatform("")).toBeNull();
    expect(parsePostgresPlatform(null)).toBeNull();
    expect(parsePostgresPlatform(undefined)).toBeNull();
  });
});
