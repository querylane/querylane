import { timestampDate } from "@bufbuild/protobuf/wkt";
import type { BuildInfo } from "@/protogen/querylane/console/v1alpha1/console_pb";

const UNKNOWN_METADATA_VALUE = "unknown";
const defaultBuiltAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function normalizeMetadataValue(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return UNKNOWN_METADATA_VALUE;
  }

  return trimmed.toLowerCase() === UNKNOWN_METADATA_VALUE
    ? UNKNOWN_METADATA_VALUE
    : trimmed;
}

function normalizeVersion(value: string): string {
  if (value === UNKNOWN_METADATA_VALUE) {
    return value;
  }

  return value.startsWith("v") ? value : `v${value}`;
}

export interface QuerylaneAboutMetadata {
  builtAt: string;
  gitBranch: string;
  gitCommit: string;
  version: string;
}

export function resolveQuerylaneAboutMetadata(
  buildInfo: BuildInfo | undefined,
  fallbackVersion: string,
  formatBuiltAt: (date: Date) => string = (date) =>
    defaultBuiltAtFormatter.format(date)
): QuerylaneAboutMetadata {
  const versionFromBuildInfo = normalizeMetadataValue(buildInfo?.version);
  const fallback = normalizeMetadataValue(fallbackVersion);
  const resolvedVersion =
    versionFromBuildInfo === UNKNOWN_METADATA_VALUE
      ? fallback
      : versionFromBuildInfo;

  let builtAt = UNKNOWN_METADATA_VALUE;
  if (buildInfo?.builtAt) {
    try {
      builtAt = formatBuiltAt(timestampDate(buildInfo.builtAt));
    } catch {
      builtAt = UNKNOWN_METADATA_VALUE;
    }
  }

  return {
    builtAt,
    gitBranch: normalizeMetadataValue(buildInfo?.gitBranch),
    gitCommit: normalizeMetadataValue(buildInfo?.gitCommit),
    version: normalizeVersion(resolvedVersion),
  };
}
