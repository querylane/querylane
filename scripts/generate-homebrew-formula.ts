import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface GenerateHomebrewFormulaOptions {
	checksums: string;
	downloadRoot?: string;
	tag: string;
	version: string;
}

const releaseVersionPattern =
	/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const checksumPattern = /^([0-9a-f]{64})\s+(\S+)$/u;

const parseChecksums = (contents: string) => {
	const checksums = new Map<string, string>();

	for (const line of contents.trim().split("\n")) {
		const match = checksumPattern.exec(line.trim());
		if (!match) {
			throw new Error(`Invalid checksum line: ${line}`);
		}

		const [, checksum, filename] = match;
		if (checksums.has(filename)) {
			throw new Error(`Duplicate checksum for ${filename}`);
		}
		checksums.set(filename, checksum);
	}

	return checksums;
};

const validateDownloadRoot = (value: string) => {
	let url: URL;
	try {
		url = new URL(value);
	} catch (error) {
		throw new Error(`Invalid download root: ${value}`, { cause: error });
	}
	const isLoopback =
		url.hostname === "127.0.0.1" ||
		url.hostname === "[::1]" ||
		url.hostname === "localhost";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new Error("Download root must use HTTPS or loopback HTTP");
	}
	if (url.username || url.password) {
		throw new Error("Download root must not contain credentials");
	}
	if (url.search || url.hash) {
		throw new Error("Download root must not contain a query or fragment");
	}

	return url.toString().replace(/\/+$/u, "");
};

export const generateHomebrewFormula = ({
	checksums: checksumContents,
	downloadRoot,
	tag,
	version,
}: GenerateHomebrewFormulaOptions) => {
	if (!releaseVersionPattern.test(version)) {
		throw new Error(`Invalid release version: ${version}`);
	}
	if (tag !== `v${version}`) {
		throw new Error(`Tag ${tag} does not match version ${version}`);
	}

	const root = validateDownloadRoot(
		downloadRoot ??
			`https://github.com/querylane/querylane/releases/download/${tag}`,
	);
	const checksums = parseChecksums(checksumContents);
	const artifact = (os: "darwin" | "linux", arch: "amd64" | "arm64") => {
		const filename = `querylane_${version}_${os}_${arch}.tar.gz`;
		const checksum = checksums.get(filename);
		if (!checksum) {
			throw new Error(`Missing checksum for ${filename}`);
		}

		return { checksum, filename };
	};

	const darwinAmd64 = artifact("darwin", "amd64");
	const darwinArm64 = artifact("darwin", "arm64");
	const linuxAmd64 = artifact("linux", "amd64");
	const linuxArm64 = artifact("linux", "arm64");

	return `class Querylane < Formula
  desc "PostgreSQL administration UI for managing multiple servers"
  homepage "https://github.com/querylane/querylane"
  version "${version}"
  license "AGPL-3.0-only"

  on_macos do
    if Hardware::CPU.arm?
      url "${root}/${darwinArm64.filename}"
      sha256 "${darwinArm64.checksum}"
    else
      url "${root}/${darwinAmd64.filename}"
      sha256 "${darwinAmd64.checksum}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${root}/${linuxArm64.filename}"
      sha256 "${linuxArm64.checksum}"
    else
      url "${root}/${linuxAmd64.filename}"
      sha256 "${linuxAmd64.checksum}"
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
`;
};

const cliOptionNames = new Set([
	"--checksums",
	"--download-root",
	"--output",
	"--tag",
	"--version",
]);

const parseCliOptions = (args: string[]) => {
	const options: Record<string, string> = {};

	for (let index = 0; index < args.length; index += 2) {
		const name = args[index];
		const value = args[index + 1];
		if (!cliOptionNames.has(name)) {
			throw new Error(`Unknown option: ${name}`);
		}
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${name}`);
		}
		if (options[name]) {
			throw new Error(`Duplicate option: ${name}`);
		}
		options[name] = value;
	}

	for (const required of ["--checksums", "--output", "--tag", "--version"]) {
		if (!options[required]) {
			throw new Error(`Missing required option: ${required}`);
		}
	}

	return options;
};

const main = async () => {
	const options = parseCliOptions(Bun.argv.slice(2));
	const formula = generateHomebrewFormula({
		checksums: await readFile(options["--checksums"], "utf8"),
		downloadRoot: options["--download-root"],
		tag: options["--tag"],
		version: options["--version"],
	});
	const output = options["--output"];
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, formula);
};

if (import.meta.main) {
	await main();
}
