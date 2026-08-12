import { describe, expect, it } from "vitest";
import { buildResetConfigCommand } from "@/components/internal-storage-recovery-command";

describe("internal storage recovery", () => {
  it("shell-quotes the active configuration path", () => {
    expect(buildResetConfigCommand("/tmp/query lane/config's.yaml")).toBe(
      "querylane server reset-config --yes --config '/tmp/query lane/config'\\''s.yaml'"
    );
  });

  it("lets the CLI resolve the standard configuration path", () => {
    expect(buildResetConfigCommand("~/.querylane/config.yaml")).toBe(
      "querylane server reset-config --yes"
    );
  });
});
