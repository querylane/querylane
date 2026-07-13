import { describe, expect, test } from "vitest";
import {
  type BreadcrumbTail,
  resolveBreadcrumbTail,
} from "@/lib/page-breadcrumb";

describe("resolveBreadcrumbTail", () => {
  test.each([
    {
      expected: { kind: "page", label: "Overview" },
      pathname: "/instances/prod",
    },
    {
      expected: { kind: "page", label: "Roles" },
      pathname: "/instances/prod/roles",
    },
    {
      expected: { kind: "page", label: "Configuration" },
      pathname: "/instances/prod/configuration",
    },
    {
      expected: { kind: "page", label: "Overview" },
      pathname: "/instances/prod/databases/app",
    },
    {
      expected: { kind: "page", label: "Query insights" },
      pathname: "/instances/prod/databases/app/insights",
    },
    {
      expected: { kind: "page", label: "Data Explorer" },
      pathname: "/instances/prod/databases/app/explorer",
    },
    {
      expected: { kind: "page", label: "Extensions" },
      pathname: "/instances/prod/databases/app/extensions",
    },
  ] as const)("$pathname -> page '$expected.label'", ({
    pathname,
    expected,
  }) => {
    expect(resolveBreadcrumbTail(pathname)).toEqual<BreadcrumbTail>(expected);
  });

  test("role detail yields a role tail with instance + role ids", () => {
    expect(
      resolveBreadcrumbTail("/instances/prod/roles/postgres")
    ).toEqual<BreadcrumbTail>({
      instanceId: "prod",
      kind: "role",
      roleId: "postgres",
    });
  });

  test("decodes percent-encoded role ids", () => {
    expect(
      resolveBreadcrumbTail("/instances/prod/roles/app%20user")
    ).toEqual<BreadcrumbTail>({
      instanceId: "prod",
      kind: "role",
      roleId: "app user",
    });
  });

  test.each([
    { pathname: "/" },
    { pathname: "/instances" },
    { pathname: "/new-instance" },
  ])("no tail for $pathname (no instance selected)", ({ pathname }) => {
    expect(resolveBreadcrumbTail(pathname)).toEqual<BreadcrumbTail>({
      kind: "none",
    });
  });
});
