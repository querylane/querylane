#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tap = "repos/querylane/homebrew-tap";
const stableVersion = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";

function api(endpoint, args = [], input, token = process.env.GH_TOKEN) {
	return JSON.parse(execFileSync("gh", ["api", endpoint, ...args], {
		encoding: "utf8", input, env: { ...process.env, GH_TOKEN: token },
	}));
}

function publish(version, formulaPath) {
	if (!process.env.GH_TOKEN) {
		console.warn("::warning::Homebrew formula generated but not published. Configure HOMEBREW_TAP_TOKEN for querylane/homebrew-tap.");
		return;
	}
	const source = api(`repos/${process.env.GITHUB_REPOSITORY}/contents/frontend/package.json?ref=main`, [], undefined, process.env.REPOSITORY_TOKEN);
	const currentVersion = JSON.parse(Buffer.from(source.content, "base64").toString("utf8")).version;
	if (currentVersion !== version) {
		console.warn(`::warning::Skipping Homebrew publishing for ${version}: main is now at ${currentVersion}.`);
		return;
	}
	const tree = api(`${tap}/git/trees/HEAD?recursive=1`);
	if (tree.truncated) throw new Error("Tap tree is truncated; cannot safely determine formula SHA");
	const sha = tree.tree.find((entry) => entry.path === "Formula/querylane.rb")?.sha;
	// Read the formula at the SAME SHA used by the write precondition.
	// main may advance between the earlier check and this tree read.
	if (sha) {
		const blob = api(`${tap}/git/blobs/${sha}`);
		const previous = Buffer.from(blob.content, "base64").toString("utf8").match(new RegExp(`^\\s*version "(${stableVersion})"\\s*$`, "m"))?.[1];
		if (!previous) throw new Error("Cannot safely read the existing stable formula version");
		const nextParts = version.split(".").map(BigInt);
		const oldParts = previous.split(".").map(BigInt);
		const difference = oldParts.map((part, index) => part - nextParts[index]).find((part) => part !== 0n);
		if (difference > 0n) {
			console.warn(`::warning::Skipping Homebrew publishing for ${version}: tap is already at ${previous}.`);
			return;
		}
	}
	const content = readFileSync(formulaPath);
	if (!content.toString("utf8").includes(`  version "${version}"\n`)) throw new Error("Formula does not match the requested release version");
	api(`${tap}/contents/Formula/querylane.rb`, ["--method", "PUT", "--input", "-"], JSON.stringify({
		message: `chore(formula): update querylane to ${version}`,
		content: content.toString("base64"), ...(sha ? { sha } : {}),
	}));
}

try {
	const [version, formulaPath] = process.argv.slice(2);
	if (!version || !formulaPath || process.argv.length !== 4 || !new RegExp(`^${stableVersion}$`).test(version)) {
		throw new Error("Usage: bun scripts/homebrew-publish.mjs STABLE_VERSION FORMULA");
	}
	publish(version, formulaPath);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	console.error("Tap update failed. For a concurrent SHA conflict, re-run CLI release; it rechecks versions and reads a fresh SHA.");
	process.exitCode = 1;
}
