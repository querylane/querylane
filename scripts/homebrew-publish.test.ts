import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// Mock only the external gh transport; invoke the production publishing CLI.
function publish(options: { existing?: string; main?: string; failure?: string; token?: string } = {}) {
	const directory = mkdtempSync(join(tmpdir(), "querylane-tap-"));
	directories.push(directory);
	const state = join(directory, "state.json");
	const receipt = join(directory, "receipt.json");
	const formula = join(directory, "querylane.rb");
	writeFileSync(state, JSON.stringify(options));
	writeFileSync(formula, 'class Querylane < Formula\n  version "1.2.3"\nend\n');
	writeFileSync(join(directory, "gh"), `#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
const state = JSON.parse(readFileSync(process.env.FAKE_STATE, 'utf8'));
const endpoint = process.argv[3];
if (endpoint.includes('frontend/package.json')) {
  if (process.env.GH_TOKEN !== 'repository-token') throw new Error('wrong source credentials');
  console.log(JSON.stringify({content: Buffer.from(JSON.stringify({version: state.main ?? '1.2.3'})).toString('base64')}));
} else if (endpoint.includes('/git/trees/')) {
  if (state.failure === 'auth') { console.error('HTTP 403'); process.exit(1); }
  console.log(JSON.stringify({tree: state.existing ? [{path: 'Formula/querylane.rb', sha: 'observed-sha'}] : []}));
} else if (endpoint.endsWith('/git/blobs/observed-sha')) {
  console.log(JSON.stringify({content: Buffer.from('  version "' + state.existing + '"\\n').toString('base64')}));
} else if (process.argv.includes('PUT')) {
  if (state.failure === 'conflict') { console.error('HTTP 409: SHA changed'); process.exit(1); }
  writeFileSync(process.env.FAKE_RECEIPT, await Bun.stdin.text());
  console.log('{}');
} else { throw new Error('unexpected request: ' + endpoint); }
`, { mode: 0o755 });
	const result = spawnSync(process.execPath, ["scripts/homebrew-publish.mjs", "1.2.3", formula], {
		encoding: "utf8",
		env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_TOKEN: options.token ?? "tap-token", REPOSITORY_TOKEN: "repository-token", GITHUB_REPOSITORY: "querylane/querylane", FAKE_STATE: state, FAKE_RECEIPT: receipt },
	});
	return { result, receipt };
}

test("does not downgrade a formula advanced after the main-version check", () => {
	const { result, receipt } = publish({ existing: "1.3.0" });
	expect(result.status).toBe(0);
	expect(result.stderr).toContain("Skipping");
	expect(() => readFileSync(receipt)).toThrow();
});

test.each([undefined, "1.2.2", "1.2.3", "1.1.99", "0.99.99"])("publishes stable formula with the observed SHA (%s)", (existing) => {
	const { result, receipt } = publish({ existing });
	expect(result.status).toBe(0);
	const update = JSON.parse(readFileSync(receipt, "utf8"));
	expect(update.sha).toBe(existing ? "observed-sha" : undefined);
	expect(Buffer.from(update.content, "base64").toString()).toContain('version "1.2.3"');
});

test.each(["2.0.0", "1.10.0", "1.2.10"])("skips a newer stable tap version %s", (existing) => {
	const { result, receipt } = publish({ existing });
	expect(result.status).toBe(0);
	expect(() => readFileSync(receipt)).toThrow();
});

test.each(["auth", "conflict"])("fails visibly on %s rather than reporting success", (failure) => {
	const { result, receipt } = publish({ existing: "1.2.2", failure });
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("re-run CLI release");
	expect(() => readFileSync(receipt)).toThrow();
});

test.each([{ main: "1.3.0" }, { token: "" }])("skips stale releases or missing tap credentials (%j)", (options) => {
	const { result, receipt } = publish(options);
	expect(result.status).toBe(0);
	expect(result.stderr).toContain("::warning::");
	expect(() => readFileSync(receipt)).toThrow();
});

test("refuses to overwrite a formula with an unrecognizable version", () => {
	const { result, receipt } = publish({ existing: "HEAD" });
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("Cannot safely read");
	expect(() => readFileSync(receipt)).toThrow();
});
