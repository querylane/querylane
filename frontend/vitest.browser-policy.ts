const UPDATE_SNAPSHOT_ARGUMENT_PATTERN = /^(-u|--update)(=|$)/;
const CANONICAL_SCREENSHOT_PLATFORM = "linux";

interface BrowserPolicyInput {
  argv: readonly string[];
  platform: NodeJS.Platform;
}

export function getBrowserPolicy({ argv, platform }: BrowserPolicyInput) {
  const isUpdatingSnapshots = argv.some((argument) =>
    UPDATE_SNAPSHOT_ARGUMENT_PATTERN.test(argument)
  );
  const isUi = argv.includes("--ui");
  const isCanonicalScreenshotPlatform =
    platform === CANONICAL_SCREENSHOT_PLATFORM;
  const canUpdateSnapshotsInteractively = isUi && isUpdatingSnapshots;
  const shouldBlockSnapshotWrites =
    !isCanonicalScreenshotPlatform && isUpdatingSnapshots;

  return {
    canRunBrowserTestsFromUi: isCanonicalScreenshotPlatform && isUi,
    canUpdateSnapshotsInteractively,
    // Vitest needs write access for screenshot comparison and failure artifacts.
    // Explicit baseline updates remain Linux-only via the guard below.
    canWriteBrowserArtifacts: !shouldBlockSnapshotWrites,
    isCanonicalScreenshotPlatform,
    isUpdatingSnapshots,
    shouldBlockSnapshotWrites,
  };
}
