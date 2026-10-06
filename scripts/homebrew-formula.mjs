#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Generate a formula from the checksums of the actual GoReleaser archives.
// Keep this separate from publishing so missing tap credentials do not block
// release binaries, and prereleases never replace the stable formula.
try {
	const [version, checksumsPath, outputPath] = process.argv.slice(2);
	if (!(version && checksumsPath && outputPath) || process.argv.length !== 5) {
		throw new Error(
			"Usage: bun scripts/homebrew-formula.mjs VERSION CHECKSUMS OUTPUT",
		);
	}
	if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
		throw new Error(
			"Homebrew requires a stable semantic version, such as 1.2.3",
		);
	}

	const checksums = new Map();
	for (const line of readFileSync(checksumsPath, "utf8").split("\n")) {
		if (!line.trim()) continue;
		const match = /^([a-f0-9]{64})\s+\*?(\S+)$/.exec(line);
		if (!match) throw new Error(`Invalid checksum line: ${line}`);
		const [, hash, filename] = match;
		if (checksums.has(filename))
			throw new Error(`Duplicate checksum: ${filename}`);
		checksums.set(filename, hash);
	}

	function download(os, arch) {
		const filename = `querylane_${version}_${os}_${arch}.tar.gz`;
		const hash = checksums.get(filename);
		if (!hash) throw new Error(`Missing archive checksum: ${filename}`);
		return `url "https://github.com/querylane/querylane/releases/download/v${version}/${filename}"
      sha256 "${hash}"`;
	}

	const formula = `# Generated from release archive checksums. Do not edit.
class Querylane < Formula
  desc "PostgreSQL admin UI for managing multiple servers"
  homepage "https://docs.querylane.net"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    on_arm do
      ${download("darwin", "arm64")}
    end
    on_intel do
      ${download("darwin", "amd64")}
    end
  end

  on_linux do
    depends_on "ca-certificates"
    on_arm do
      ${download("linux", "arm64")}
    end
    on_intel do
      ${download("linux", "amd64")}
    end
  end

  def install
    bin.install "querylane"
  end

  def caveats
    <<~EOS
      Start locally: querylane server start --host=127.0.0.1
      Open http://localhost:8080 and configure storage in the first-launch wizard.
      Querylane has no built-in authentication. Do not expose it publicly.
      Configuration and embedded storage in ~/.querylane survive upgrades and uninstall.
    EOS
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/querylane --version").strip
  end
end
`;
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, formula);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
