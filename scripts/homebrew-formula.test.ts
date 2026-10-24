import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

test.each([
	{ name: "prerelease", version: "1.2.3-rc.1", content: "" },
	{ name: "unsafe version", version: '1.2.3"; system "false', content: "" },
	{
		name: "missing archive",
		version: "1.2.3",
		content: `${"a".repeat(64)}  querylane_1.2.3_darwin_arm64.tar.gz\n`,
	},
	{
		name: "malformed checksum",
		version: "1.2.3",
		content: "not-a-hash  querylane_1.2.3_linux_amd64.tar.gz\n",
	},
	{
		name: "duplicate checksum",
		version: "1.2.3",
		content: `${"a".repeat(64)}  duplicate\n${"b".repeat(64)}  duplicate\n`,
	},
])("rejects $name without overwriting a formula", ({ version, content }) => {
	const directory = mkdtempSync(join(tmpdir(), "querylane-brew-"));
	directories.push(directory);
	const checksums = join(directory, "checksums.txt");
	const output = join(directory, "querylane.rb");
	writeFileSync(checksums, content);
	writeFileSync(output, "previous formula");

	const result = spawnSync(
		process.execPath,
		["scripts/homebrew-formula.mjs", version, checksums, output],
		{ encoding: "utf8" },
	);

	expect(result.status).toBe(1);
	expect(result.stderr.trim()).not.toBe("");
	expect(readFileSync(output, "utf8")).toBe("previous formula");
});

test("generates a binary Homebrew formula for macOS and Linux from release checksums", () => {
	const directory = mkdtempSync(join(tmpdir(), "querylane-brew-"));
	directories.push(directory);
	const checksums = join(directory, "checksums.txt");
	const output = join(directory, "querylane.rb");
	const platforms = [
		"darwin_amd64",
		"darwin_arm64",
		"linux_amd64",
		"linux_arm64",
	];
	writeFileSync(
		checksums,
		platforms
			.map(
				(platform, index) =>
					`${String(index + 1).repeat(64)}  querylane_1.2.3_${platform}.tar.gz`,
			)
			.join("\n"),
	);

	const result = spawnSync(
		process.execPath,
		["scripts/homebrew-formula.mjs", "1.2.3", checksums, output],
		{ encoding: "utf8" },
	);

	expect(result.status).toBe(0);
	const formula = readFileSync(output, "utf8");
	for (const [index, platform] of platforms.entries()) {
		expect(formula).toContain(
			`https://github.com/querylane/querylane/releases/download/v1.2.3/querylane_1.2.3_${platform}.tar.gz`,
		);
		expect(formula).toContain(`sha256 "${String(index + 1).repeat(64)}"`);
	}
	expect(formula).toContain('bin.install "querylane"');
	expect(formula).toContain("querylane server start --host=127.0.0.1");
	expect(formula).not.toContain("windows");
});
