import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateHomebrewFormula } from "./generate-homebrew-formula";

const generatorScript = fileURLToPath(
	new URL("./generate-homebrew-formula.ts", import.meta.url),
);
const temporaryDirectories: string[] = [];
const checksums = [
	`${"1".repeat(64)}  querylane_1.2.3_darwin_amd64.tar.gz`,
	`${"2".repeat(64)}  querylane_1.2.3_darwin_arm64.tar.gz`,
	`${"3".repeat(64)}  querylane_1.2.3_linux_amd64.tar.gz`,
	`${"4".repeat(64)}  querylane_1.2.3_linux_arm64.tar.gz`,
	`${"5".repeat(64)}  querylane_1.2.3_windows_amd64.zip`,
].join("\n");

const runGenerator = (args: string[]) =>
	spawnSync("bun", [generatorScript, ...args], {
		encoding: "utf8",
		stdio: "pipe",
	});

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

test("generates a deterministic macOS and Linux formula", () => {
	expect(
		generateHomebrewFormula({
			checksums,
			tag: "v1.2.3",
			version: "1.2.3",
		}),
	).toBe(`class Querylane < Formula
  desc "PostgreSQL administration UI for managing multiple servers"
  homepage "https://github.com/querylane/querylane"
  version "1.2.3"
  license "AGPL-3.0-only"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/querylane/querylane/releases/download/v1.2.3/querylane_1.2.3_darwin_arm64.tar.gz"
      sha256 "${"2".repeat(64)}"
    else
      url "https://github.com/querylane/querylane/releases/download/v1.2.3/querylane_1.2.3_darwin_amd64.tar.gz"
      sha256 "${"1".repeat(64)}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/querylane/querylane/releases/download/v1.2.3/querylane_1.2.3_linux_arm64.tar.gz"
      sha256 "${"4".repeat(64)}"
    else
      url "https://github.com/querylane/querylane/releases/download/v1.2.3/querylane_1.2.3_linux_amd64.tar.gz"
      sha256 "${"3".repeat(64)}"
    end
  end

  def install
    bin.install "querylane"
  end

  service do
    run [opt_bin/"querylane", "server", "start", "--host", "127.0.0.1"]
    keep_alive true
    working_dir var/"querylane"
    log_path var/"log/querylane.log"
    error_log_path var/"log/querylane.log"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/querylane --version").strip
  end
end
`);
});

test("writes a formula for a local tap from the command line", () => {
	const directory = mkdtempSync(join(tmpdir(), "querylane-homebrew-formula-"));
	temporaryDirectories.push(directory);
	const checksumPath = join(directory, "checksums.txt");
	const formulaPath = join(directory, "tap", "Formula", "querylane.rb");
	writeFileSync(checksumPath, checksums);

	execFileSync(
		"bun",
		[
			generatorScript,
			"--checksums",
			checksumPath,
			"--version",
			"1.2.3",
			"--tag",
			"v1.2.3",
			"--output",
			formulaPath,
			"--download-root",
			"http://127.0.0.1:8765",
		],
		{ stdio: "pipe" },
	);

	const formula = readFileSync(formulaPath, "utf8");
	expect(formula).toContain(
		'url "http://127.0.0.1:8765/querylane_1.2.3_darwin_arm64.tar.gz"',
	);
	expect(formula).toContain(
		'run [opt_bin/"querylane", "server", "start", "--host", "127.0.0.1"]',
	);
});

test("rejects an incomplete release archive matrix", () => {
	expect(() =>
		generateHomebrewFormula({
			checksums: checksums.replace(
				/^4{64} {2}querylane_1\.2\.3_linux_arm64\.tar\.gz\n/mu,
				"",
			),
			tag: "v1.2.3",
			version: "1.2.3",
		}),
	).toThrow("Missing checksum for querylane_1.2.3_linux_arm64.tar.gz");
});

test.each([
	["not a checksum", "Invalid checksum line: not a checksum"],
	[
		`${checksums}\n${"1".repeat(64)}  querylane_1.2.3_darwin_amd64.tar.gz`,
		"Duplicate checksum for querylane_1.2.3_darwin_amd64.tar.gz",
	],
])("rejects malformed checksum manifests", (manifest, error) => {
	expect(() =>
		generateHomebrewFormula({
			checksums: manifest,
			tag: "v1.2.3",
			version: "1.2.3",
		}),
	).toThrow(error);
});

test.each([
	["1.2", "v1.2", "Invalid release version: 1.2"],
	["1.2.3", "v2.0.0", "Tag v2.0.0 does not match version 1.2.3"],
])("rejects invalid release identities", (version, tag, error) => {
	expect(() =>
		generateHomebrewFormula({
			checksums,
			tag,
			version,
		}),
	).toThrow(error);
});

test("rejects plaintext artifact URLs outside loopback", () => {
	expect(() =>
		generateHomebrewFormula({
			checksums,
			downloadRoot: "http://downloads.example.com/v1.2.3",
			tag: "v1.2.3",
			version: "1.2.3",
		}),
	).toThrow("Download root must use HTTPS or loopback HTTP");
});

test("allows IPv4, IPv6, and named loopback artifact URLs", () => {
	for (const downloadRoot of [
		"http://127.0.0.1:8765",
		"http://[::1]:8765",
		"http://localhost:8765",
	]) {
		expect(
			generateHomebrewFormula({
				checksums,
				downloadRoot,
				tag: "v1.2.3",
				version: "1.2.3",
			}),
		).toContain(`url "${downloadRoot}/querylane_1.2.3_darwin_arm64.tar.gz"`);
	}
});

test.each([
	["not a URL", "Invalid download root: not a URL"],
	[
		"https://user:secret@downloads.example.com/v1.2.3",
		"Download root must not contain credentials",
	],
	[
		"https://downloads.example.com/v1.2.3?mirror=1",
		"Download root must not contain a query or fragment",
	],
	[
		"https://downloads.example.com/v1.2.3#archive",
		"Download root must not contain a query or fragment",
	],
])("rejects ambiguous artifact URLs", (downloadRoot, error) => {
	expect(() =>
		generateHomebrewFormula({
			checksums,
			downloadRoot,
			tag: "v1.2.3",
			version: "1.2.3",
		}),
	).toThrow(error);
});

test.each([
	[["--unknown", "value"], "Unknown option: --unknown"],
	[["--checksums"], "Missing value for --checksums"],
	[
		["--checksums", "one", "--checksums", "two"],
		"Duplicate option: --checksums",
	],
	[
		[
			"--checksums",
			"checksums.txt",
			"--output",
			"querylane.rb",
			"--version",
			"1.2.3",
		],
		"Missing required option: --tag",
	],
])("rejects invalid command-line options", (args, error) => {
	const result = runGenerator(args);

	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain(error);
});
