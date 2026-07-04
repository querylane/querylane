import { describe, expect, it } from "vitest";
import { buildConfigPreview } from "./manual-yaml-config-preview";

describe("buildConfigPreview", () => {
  it("uses the backend database config shape", () => {
    const preview = buildConfigPreview("/tmp/querylane.yaml");

    expect(preview).toContain("database:\n");
    expect(preview).toContain("  database: querylane\n");
    expect(preview).toContain("  ssl_mode: disable\n");
    expect(preview).toContain("# /tmp/querylane.yaml");
    expect(preview).not.toContain("meta:");
    expect(preview).not.toContain("ssl: false");
  });
});
