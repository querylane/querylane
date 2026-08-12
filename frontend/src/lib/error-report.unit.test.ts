import { Code, ConnectError } from "@connectrpc/connect";
import { describe, expect, test } from "@rstest/core";

import { buildGitHubBugReportUrl } from "@/lib/error-report";
import { normalizeAppUiError } from "@/lib/ui-error";

describe("GitHub bug report URL", () => {
  test("prefills the bug form with allowlisted diagnostics", () => {
    const secret = "postgres://admin:secret@private.example.test/customer";
    const original = new ConnectError(
      `failed to connect to ${secret}`,
      Code.Internal
    );
    original.stack = [
      `ConnectError: failed to connect to ${secret}`,
      `    at connect (${secret}?sslmode=require)`,
      "    at loadRoles (https://reporter:password@console.example.test/assets/app.js?token=secret#fragment:12:3)",
    ].join("\n");
    original.metadata.set("authorization", "Bearer secret-token");
    const error = normalizeAppUiError(original, {
      action: "load roles",
      area: "roles",
      endpoint: "querylane.console.v1alpha1.RoleService/ListRoles",
      routeId: "/instances/$instanceId/roles",
      source: "query",
      surface: "route",
    });

    const url = new URL(buildGitHubBugReportUrl(error, "querylane/querylane"));
    const diagnostics = url.searchParams.get("diagnostics") ?? "";

    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/querylane/querylane/issues/new");
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("labels")).toBeNull();
    expect(url.searchParams.get("title")).toBe("Unexpected error");
    expect(JSON.parse(diagnostics)).toMatchObject({
      code: "Internal",
      context: {
        action: "load roles",
        area: "roles",
        endpoint: "querylane.console.v1alpha1.RoleService/ListRoles",
        routeId: "/instances/$instanceId/roles",
        source: "query",
        surface: "route",
      },
      title: "Unexpected error",
    });
    expect(diagnostics).toContain("https://console.example.test/assets/app.js");
    expect(diagnostics).not.toContain(secret);
    expect(diagnostics).not.toContain("secret-token");
    expect(diagnostics).not.toContain("token=secret");
    expect(diagnostics).not.toContain("reporter:password");
    expect(diagnostics).not.toContain("postgres://");
  });

  test("falls back to Querylane's repository for invalid configuration", () => {
    const error = normalizeAppUiError(new Error("failed"));

    const url = new URL(buildGitHubBugReportUrl(error, "https://evil.test"));

    expect(url.pathname).toBe("/querylane/querylane/issues/new");
  });

  test("caps large reports below common browser and server URL limits", () => {
    const original = new Error("render failed");
    original.stack = `Error: render failed\n${"    at render (https://console.example.test/assets/app.js:1:1)\n".repeat(500)}`;
    const error = normalizeAppUiError(original);

    const url = buildGitHubBugReportUrl(error, "querylane/querylane");

    expect(url.length).toBeLessThan(8000);
  });
});
