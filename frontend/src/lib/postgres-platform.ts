import { isNonEmptyString } from "@/lib/value-guards";

interface PostgresPlatform {
  arch: string;
  os: string;
}

const OS_SEGMENT_LABELS: readonly (readonly [string, string])[] = [
  ["linux", "linux"],
  ["darwin", "macos"],
  ["mingw", "windows"],
  ["cygwin", "windows"],
  ["msvc", "windows"],
  ["windows", "windows"],
  ["freebsd", "freebsd"],
  ["openbsd", "openbsd"],
  ["netbsd", "netbsd"],
  ["dragonfly", "dragonfly"],
  ["solaris", "solaris"],
  ["illumos", "illumos"],
  ["aix", "aix"],
];

const PLATFORM_TRIPLE_PATTERN = /\bon\s+(?<capture1>[\w.]+(?:-[\w.]+)+)/u;

/**
 * Extracts architecture and operating system from a full PostgreSQL version
 * string. Returns null when the string does not carry a recognizable target
 * triple (e.g. Windows builds report "compiled by Visual C++" without one).
 */
function parsePostgresPlatform(version: string | null | undefined) {
  if (!isNonEmptyString(version)) {
    return null;
  }

  const triple = PLATFORM_TRIPLE_PATTERN.exec(version)?.[1];
  if (!isNonEmptyString(triple)) {
    return null;
  }

  const segments = triple.split("-");
  const [arch] = segments;
  if (!isNonEmptyString(arch)) {
    return null;
  }

  for (const segment of segments.slice(1)) {
    const normalized = segment.toLowerCase();
    for (const [needle, label] of OS_SEGMENT_LABELS) {
      if (normalized.includes(needle)) {
        return { arch, os: label } satisfies PostgresPlatform | null;
      }
    }
  }

  return null;
}

export type { PostgresPlatform };
export { parsePostgresPlatform };
