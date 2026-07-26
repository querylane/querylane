export function extractReleaseNotes(
	changelog: string,
	version: string,
): string {
	const lines = changelog.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) {
		throw new Error(`version "${version}" was not found in the changelog`);
	}

	const nextVersion = lines.findIndex(
		(line, index) => index > start && line.startsWith("## "),
	);
	const notes = lines
		.slice(start + 1, nextVersion === -1 ? undefined : nextVersion)
		.join("\n")
		.trim();
	if (!notes) {
		throw new Error(`version "${version}" has no release notes`);
	}

	return `${notes}\n`;
}

if (import.meta.main) {
	const [version, changelogPath] = Bun.argv.slice(2);
	if (!(version && changelogPath)) {
		throw new Error(
			"usage: extract-release-notes.ts <version> <changelog-path>",
		);
	}

	const changelog = await Bun.file(changelogPath).text();
	process.stdout.write(extractReleaseNotes(changelog, version));
}
