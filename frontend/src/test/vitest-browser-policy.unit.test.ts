import { describe, expect, it } from "vitest";

import { getBrowserPolicy } from "../../vitest.browser-policy";

describe("browser policy", () => {
  it("blocks snapshot writes outside Linux", () => {
    expect(
      getBrowserPolicy({ argv: ["vitest", "--update"], platform: "darwin" })
    ).toMatchObject({
      canWriteBrowserArtifacts: false,
      shouldBlockSnapshotWrites: true,
    });
  });

  it("allows Linux snapshot writes for update runs", () => {
    expect(
      getBrowserPolicy({ argv: ["vitest", "--update"], platform: "linux" })
    ).toMatchObject({
      canWriteBrowserArtifacts: true,
      shouldBlockSnapshotWrites: false,
    });
  });

  it("allows write API during normal local browser runs", () => {
    expect(
      getBrowserPolicy({ argv: ["vitest", "run"], platform: "linux" })
    ).toMatchObject({
      canWriteBrowserArtifacts: true,
    });
  });

  it("allows write API during normal non-Linux browser runs", () => {
    expect(
      getBrowserPolicy({
        argv: ["vitest", "run"],
        platform: "darwin",
      })
    ).toMatchObject({
      canWriteBrowserArtifacts: true,
    });
  });

  it("allows exec only for local Linux UI runs", () => {
    expect(
      getBrowserPolicy({ argv: ["vitest", "--ui"], platform: "linux" })
    ).toMatchObject({
      canRunBrowserTestsFromUi: true,
      canWriteBrowserArtifacts: true,
    });
  });
});
