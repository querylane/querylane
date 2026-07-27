import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const read = (path: string) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");
const actionsExpression = (expression: string) => `\${{ ${expression} }}`;
const releaseStateScript = fileURLToPath(
	new URL("./resolve-release-state.sh", import.meta.url),
);
const latestReleaseScript = fileURLToPath(
	new URL("./is-latest-release.sh", import.meta.url),
);
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

const git = (directory: string, ...args: string[]) =>
	execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();

const createRepository = () => {
	const directory = mkdtempSync(join(tmpdir(), "querylane-release-state-"));
	temporaryDirectories.push(directory);
	git(directory, "init", "--quiet");
	git(directory, "config", "user.email", "release-test@querylane.net");
	git(directory, "config", "user.name", "Release test");
	writeFileSync(join(directory, "fixture.txt"), "initial\n");
	git(directory, "add", "fixture.txt");
	git(directory, "commit", "--quiet", "-m", "initial");

	return directory;
};

const commitFixture = (directory: string, contents: string) => {
	writeFileSync(join(directory, "fixture.txt"), contents);
	git(directory, "add", "fixture.txt");
	git(directory, "commit", "--quiet", "-m", contents.trim());
};

const resolveReleaseState = (
	directory: string,
	{
		createdTags = [],
		expectedTag = "v1.0.0",
		runAttempt,
		version = "1.0.0",
	}: {
		createdTags?: string[];
		expectedTag?: string;
		runAttempt: number;
		version?: string;
	},
) => {
	const output = join(directory, "github-output");
	execFileSync(
		"bash",
		[
			releaseStateScript,
			expectedTag,
			version,
			String(runAttempt),
			...createdTags,
		],
		{
			cwd: directory,
			env: { ...process.env, GITHUB_OUTPUT: output },
			stdio: "pipe",
		},
	);

	return Object.fromEntries(
		readFileSync(output, "utf8")
			.trim()
			.split("\n")
			.map((line) => {
				const separator = line.indexOf("=");
				return [line.slice(0, separator), line.slice(separator + 1)];
			}),
	);
};

test("keeps ordinary main runs as no-op releases", () => {
	const directory = createRepository();
	git(directory, "tag", "v1.0.0");
	commitFixture(directory, "ordinary main commit\n");

	expect(resolveReleaseState(directory, { runAttempt: 1 })).toEqual({
		publish_latest: "false",
		published: "false",
		push_tag: "false",
		tag: "",
		version: "",
	});
	expect(resolveReleaseState(directory, { runAttempt: 2 })).toEqual({
		publish_latest: "false",
		published: "false",
		push_tag: "false",
		tag: "",
		version: "",
	});
});

test("publishes a newly created expected tag", () => {
	const directory = createRepository();
	git(directory, "tag", "v1.0.0");

	expect(
		resolveReleaseState(directory, {
			createdTags: ["v1.0.0"],
			runAttempt: 1,
		}),
	).toEqual({
		publish_latest: "true",
		published: "true",
		push_tag: "true",
		tag: "v1.0.0",
		version: "1.0.0",
	});
});

test("resumes a same-commit tag without moving latest backwards", () => {
	const directory = createRepository();
	const releaseCommit = git(directory, "rev-parse", "HEAD");
	git(directory, "tag", "v1.0.0");
	commitFixture(directory, "newer release\n");
	git(directory, "tag", "v2.0.0");
	git(directory, "checkout", "--quiet", "--detach", releaseCommit);

	expect(resolveReleaseState(directory, { runAttempt: 2 })).toEqual({
		publish_latest: "false",
		published: "true",
		push_tag: "false",
		tag: "v1.0.0",
		version: "1.0.0",
	});
});

test("recognizes the newest release independently of the workflow attempt", () => {
	const directory = createRepository();
	git(directory, "tag", "v9.0.0");
	git(directory, "tag", "v10.0.0");

	const isLatest = (version: string) =>
		execFileSync("bash", [latestReleaseScript, version], {
			cwd: directory,
			encoding: "utf8",
		}).trim();

	expect(isLatest("9.0.0")).toBe("false");
	expect(isLatest("10.0.0")).toBe("true");
});

test("rejects a tag that does not match the expected release", () => {
	const directory = createRepository();
	git(directory, "tag", "v2.0.0");

	expect(() =>
		resolveReleaseState(directory, {
			createdTags: ["v2.0.0"],
			runAttempt: 1,
		}),
	).toThrow();
});

test("preserves Changesets notes in automatic and manual recovery paths", async () => {
	const [release, documentation, scriptsCi] = await Promise.all([
		read(".github/workflows/release.yml"),
		read("docs/release-process.md"),
		read(".github/workflows/scripts-ci.yml"),
	]);

	expect(release).not.toContain("--generate-notes");
	expect(documentation).not.toContain("--generate-notes");
	expect(
		release.match(
			/bun scripts\/extract-release-notes\.ts "\$VERSION" frontend\/CHANGELOG\.md/g,
		),
	).toHaveLength(2);
	expect(release.indexOf("bun scripts/extract-release-notes.ts")).toBeLessThan(
		release.indexOf('git push origin "refs/tags/$tag"'),
	);
	expect(documentation).toContain(
		'bun scripts/extract-release-notes.ts "$version" frontend/CHANGELOG.md > "$notes_file"',
	);
	expect(scriptsCi).toContain("- docs/release-process.md");
});

test("serializes same-tag publishing and validates artifacts for every PR", async () => {
	const [publisher, validation, goreleaser] = await Promise.all([
		read(".github/workflows/_release-artifacts.yml"),
		read(".github/workflows/release-artifacts-ci.yml"),
		read(".goreleaser.yaml"),
	]);

	expect(publisher).toContain(
		`group: release-artifacts-${actionsExpression("inputs.tag")}`,
	);
	expect(publisher).toContain("cancel-in-progress: false");
	expect(publisher).toContain('gh release view "$TAG"');
	expect(goreleaser).toMatch(/changelog:\n {2}disable: true/u);
	expect(validation).not.toMatch(/^ {4}paths:/mu);
	expect(validation).toContain("paths-ignore:");
	expect(validation).toContain(
		"bun test scripts/extract-release-notes.test.ts scripts/release-workflow.test.ts",
	);
});

test("stamps one build-info source used by the CLI and Console", async () => {
	const [main, goreleaser, dockerfile, backendTasks, buildstamp] =
		await Promise.all([
			read("backend/main.go"),
			read(".goreleaser.yaml"),
			read("Dockerfile"),
			read("taskfiles/backend.yaml"),
			read("backend/buildstamp/buildstamp.go"),
		]);

	expect(main).toContain('"version": buildstamp.Version');
	expect(main).not.toContain('var version = "dev"');

	for (const buildConfig of [goreleaser, dockerfile, backendTasks]) {
		expect(buildConfig).toContain(
			"github.com/querylane/querylane/backend/buildstamp.Version",
		);
		expect(buildConfig).not.toContain(
			"github.com/querylane/querylane/backend/service/console.Version",
		);
		const stampedSymbols = [
			...buildConfig.matchAll(
				/github\.com\/querylane\/querylane\/backend\/buildstamp\.([A-Za-z]\w*)=/gu,
			),
		].map((match) => match[1]);
		expect(stampedSymbols.length).toBeGreaterThan(0);
		for (const symbol of stampedSymbols) {
			expect(buildstamp).toMatch(new RegExp(`\\b${symbol}\\b`, "u"));
		}
	}
});

test("uses one GoReleaser version file in validation and publishing", async () => {
	const [publisher, validation, toolVersions] = await Promise.all([
		read(".github/workflows/_release-artifacts.yml"),
		read(".github/workflows/release-artifacts-ci.yml"),
		read(".tool-versions"),
	]);

	const goreleaserVersion = toolVersions
		.split("\n")
		.find((line) => line.startsWith("goreleaser "))
		?.split(/\s+/u)[1];
	expect(goreleaserVersion).toMatch(/^\d+\.\d+\.\d+$/u);
	for (const workflow of [publisher, validation]) {
		expect(workflow).toContain("version-file: .tool-versions");
		expect(workflow).not.toContain(goreleaserVersion);
	}
});

test("publishes latest only for the newest release tag", async () => {
	const [release, dockerBuild] = await Promise.all([
		read(".github/workflows/release.yml"),
		read(".github/workflows/_docker-build.yml"),
	]);

	expect(release).toContain(
		`publish_latest: ${actionsExpression("needs.release.outputs.publish_latest == 'true'")}`,
	);
	expect(dockerBuild).toContain("publish_latest:");
	expect(dockerBuild).toContain("fetch-tags: true");
	expect(dockerBuild).toContain('bash scripts/is-latest-release.sh "$VERSION"');
	expect(dockerBuild).toContain(
		`enable=${actionsExpression("inputs.version != '' && steps.release-channel.outputs.publish_latest == 'true'")}`,
	);
});
