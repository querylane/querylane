import { describe, expect, it } from "vitest";
import { buildConfigManagedInstanceSnippet } from "@/components/config-managed-guidance";

describe("config-managed guidance", () => {
  it("builds a copyable instance YAML snippet with the active config path", () => {
    const snippet = buildConfigManagedInstanceSnippet(
      "/etc/querylane/config.yaml"
    );

    expect(snippet).toContain("# /etc/querylane/config.yaml\n");
    expect(snippet).toContain("instances:\n");
    expect(snippet).toContain("display_name: Local PostgreSQL\n");
    expect(snippet).toContain("ssl_mode: disable\n");
  });
});
