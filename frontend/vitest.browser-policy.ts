const UPDATE_SNAPSHOT_ARGUMENT_PATTERN = /^(-u|--update)(=|$)/;
const CANONICAL_SCREENSHOT_PLATFORM = "linux";

interface BrowserPolicyInput {
  argv: readonly string[];
  isCi?: boolean;
  platform: NodeJS.Platform;
}

export function getBrowserPolicy({
  argv,
  isCi = false,
  platform,
}: BrowserPolicyInput) {
  const isUpdatingSnapshots = argv.some((argument) =>
    UPDATE_SNAPSHOT_ARGUMENT_PATTERN.test(argument)
  );
  const isUi = argv.includes("--ui");
  const isCanonicalScreenshotPlatform =
    platform === CANONICAL_SCREENSHOT_PLATFORM;
  const canUpdateSnapshotsInteractively = isUi && isUpdatingSnapshots;

  return {
    canRunBrowserTestsFromUi: isCanonicalScreenshotPlatform && isUi,
    canUpdateSnapshotsInteractively,
    canWriteBrowserArtifacts:
      isCanonicalScreenshotPlatform &&
      (isCi || isUpdatingSnapshots || canUpdateSnapshotsInteractively),
    isCanonicalScreenshotPlatform,
    isUpdatingSnapshots,
    shouldBlockSnapshotWrites:
      !isCanonicalScreenshotPlatform && isUpdatingSnapshots,
  };
}
