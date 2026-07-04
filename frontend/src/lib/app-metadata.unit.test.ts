import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { resolveQuerylaneAboutMetadata } from "@/lib/app-metadata";
import { BuildInfoSchema } from "@/protogen/querylane/console/v1alpha1/console_pb";

describe("resolveQuerylaneAboutMetadata", () => {
  it("falls back to frontend version and unknown placeholders", () => {
    const metadata = resolveQuerylaneAboutMetadata(undefined, "0.1.0");

    expect(metadata.version).toBe("v0.1.0");
    expect(metadata.gitCommit).toBe("unknown");
    expect(metadata.gitBranch).toBe("unknown");
    expect(metadata.builtAt).toBe("unknown");
  });

  it("normalizes build info values when metadata is available", () => {
    const buildInfo = create(BuildInfoSchema, {
      builtAt: timestampFromDate(new Date("2026-01-01T12:30:00.000Z")),
      gitBranch: "main",
      gitCommit: "abcdef1",
      version: "1.4.2",
    });

    const metadata = resolveQuerylaneAboutMetadata(buildInfo, "0.1.0", (date) =>
      date.toISOString()
    );

    expect(metadata.version).toBe("v1.4.2");
    expect(metadata.gitCommit).toBe("abcdef1");
    expect(metadata.gitBranch).toBe("main");
    expect(metadata.builtAt).toBe("2026-01-01T12:30:00.000Z");
  });

  it("preserves explicit unknown version and falls back when build version is blank", () => {
    const unknownBuild = create(BuildInfoSchema, {
      gitBranch: " unknown ",
      gitCommit: "  ",
      version: "unknown",
    });
    expect(resolveQuerylaneAboutMetadata(unknownBuild, "2.0.0")).toMatchObject({
      gitBranch: "unknown",
      gitCommit: "unknown",
      version: "v2.0.0",
    });

    expect(resolveQuerylaneAboutMetadata(undefined, "unknown").version).toBe(
      "unknown"
    );
  });

  it("uses unknown builtAt when timestamp conversion or formatting fails", () => {
    const buildInfo = create(BuildInfoSchema, {
      builtAt: timestampFromDate(new Date("2026-01-01T12:30:00.000Z")),
    });

    expect(
      resolveQuerylaneAboutMetadata(buildInfo, "1.0.0", () => {
        throw new Error("formatter failed");
      }).builtAt
    ).toBe("unknown");
  });

  it("uses default built-at formatter when none is supplied", () => {
    const metadata = resolveQuerylaneAboutMetadata(
      create(BuildInfoSchema, {
        builtAt: timestampFromDate(new Date("2026-01-01T12:30:00.000Z")),
        version: "1.0.0",
      }),
      "0.1.0"
    );

    expect(metadata.builtAt).not.toBe("unknown");
  });
});
