import { describe, expect, it } from "bun:test";
import { extractReleaseNotes } from "./extract-release-notes";

describe("extractReleaseNotes", () => {
	it("returns only the requested Changesets version section", () => {
		const changelog = `# @querylane/frontend

## 0.2.0

### Minor Changes

- Add release archives.

## 0.1.0

### Patch Changes

- Initial release.
`;

		expect(extractReleaseNotes(changelog, "0.2.0")).toBe(
			"### Minor Changes\n\n- Add release archives.\n",
		);
	});

	it("rejects a missing or empty version section", () => {
		expect(() =>
			extractReleaseNotes("## 0.1.0\n\n- Initial release.\n", "0.2.0"),
		).toThrow('version "0.2.0" was not found');
		expect(() =>
			extractReleaseNotes("## 0.2.0\n\n## 0.1.0\n", "0.2.0"),
		).toThrow('version "0.2.0" has no release notes');
	});
});
