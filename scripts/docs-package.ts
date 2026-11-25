import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
} from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { init, parse } from "es-module-lexer";

/** Package the emitted Node SSR imports, not Blume's build/deploy dependency graph. */
export async function packageDocsRuntime(source: string, output: string) {
	source = realpathSync(source);
	output = resolve(output);
	if (existsSync(output) || source.startsWith(`${output}${sep}`)) {
		throw new Error(
			"Docs runtime output must be a new directory outside its source ancestors.",
		);
	}
	const inside = (path: string) => {
		const name = relative(source, path);
		if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) {
			throw new Error(`Runtime dependency outside build root: ${path}`);
		}
		return join(output, name);
	};
	const packages = new Set<string>();
	const links = new Map<string, string>();
	const add = (directory: string, link: string) => {
		const target = realpathSync(directory);
		inside(target);
		packages.add(target);
		links.set(inside(link), inside(target));
	};
	await init();
	const server = join(source, "dist/server");
	if (!existsSync(join(server, "entry.mjs"))) {
		throw new Error(
			"Docs server entry missing; run docs:build before packaging.",
		);
	}
	for (const file of readdirSync(server, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!(file.isFile() && /\.(?:mjs|js|cjs)$/u.test(file.name))) continue;
		if (relative(server, file.parentPath).split(sep).includes("node_modules"))
			continue;
		if (!file.name.endsWith(".mjs"))
			throw new Error(`Expected Astro ESM output: ${file.name}`);
		const path = join(file.parentPath, file.name);
		for (const item of parse(readFileSync(path, "utf8"))[0]) {
			if (item.type === "import-meta") continue;
			if (item.type === "dynamic" && (!item.specifier || item.glob)) {
				throw new Error(
					`Untraceable dynamic import in ${path}; resolve it before packaging.`,
				);
			}
			const specifier = item.specifier;
			if (!specifier || isBuiltin(specifier)) continue;
			const entry = Bun.resolveSync(specifier, dirname(path));
			if (specifier.startsWith(".")) {
				if (!entry.startsWith(`${server}${sep}`))
					throw new Error(`Import escapes server output: ${specifier}`);
				continue;
			}
			const name = specifier
				.split("/")
				.slice(0, specifier.startsWith("@") ? 2 : 1)
				.join("/");
			let directory = dirname(realpathSync(entry));
			while (directory !== dirname(directory)) {
				const manifest = join(directory, "package.json");
				if (
					existsSync(manifest) &&
					JSON.parse(readFileSync(manifest, "utf8")).name === name
				)
					break;
				directory = dirname(directory);
			}
			if (directory === dirname(directory))
				throw new Error(`Cannot locate package for ${specifier}`);
			add(directory, join(server, "node_modules", name));
		}
	}
	// Copy whole production packages: internal dynamic imports, native bindings,
	// data files and license notices survive without a fragile file allowlist.
	// Optional peer integrations are not enabled by installation alone; an emitted
	// import must select them. Installed optional dependencies (e.g. sharp) remain.
	for (const directory of packages) {
		const manifest = JSON.parse(
			readFileSync(join(directory, "package.json"), "utf8"),
		);
		const optional = manifest.optionalDependencies ?? {};
		const required = { ...manifest.dependencies, ...manifest.peerDependencies };
		for (const [name, meta] of Object.entries(
			manifest.peerDependenciesMeta ?? {},
		)) {
			if (
				meta &&
				typeof meta === "object" &&
				"optional" in meta &&
				meta.optional &&
				!manifest.dependencies?.[name]
			)
				delete required[name];
		}
		for (const name of new Set([
			...Object.keys(required),
			...Object.keys(optional),
		])) {
			const paths =
				createRequire(join(directory, "package.json")).resolve.paths(name) ??
				[];
			const dependency = paths
				.map((path) => join(path, name))
				.find((path) => existsSync(join(path, "package.json")));
			if (!dependency) {
				if (name in optional) continue;
				throw new Error(
					`Missing production dependency ${name} required by ${manifest.name}`,
				);
			}
			add(dependency, join(directory, "node_modules", name));
		}
	}
	mkdirSync(output, { recursive: true });
	cpSync(join(source, "dist"), join(output, "dist"), {
		recursive: true,
		filter: (path) =>
			!relative(join(source, "dist"), path).split(sep).includes("node_modules"),
	});
	for (const directory of packages) {
		cpSync(directory, inside(directory), {
			recursive: true,
			dereference: true,
			filter: (path) =>
				!relative(directory, path).split(sep).includes("node_modules"),
		});
	}
	for (const [link, target] of links) {
		if (link === target) continue;
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(relative(dirname(link), target), link, "dir");
	}
	// Bundled code/fonts no longer have an installed package in the closure.
	// Retain their published notices too, without retaining their build tools.
	for await (const name of new Bun.Glob("**/*").scan({
		cwd: join(source, "node_modules"),
		onlyFiles: true,
		dot: true,
	})) {
		if (
			!/(?:^|\/)(?:licen[cs]e|copying|copyright|notice|third-party-notices)(?:[.-]|$)/iu.test(
				name,
			)
		)
			continue;
		const target = join(output, "licenses/node_modules", name);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(source, "node_modules", name), target);
	}
	if (existsSync(join(source, "patches"))) {
		cpSync(join(source, "patches"), join(output, "licenses/patches"), {
			recursive: true,
		});
	}
	console.log(
		`Packaged docs SSR: ${packages.size} production packages (including assets and notices).`,
	);
}

if (import.meta.main) {
	await packageDocsRuntime(
		process.cwd(),
		resolve(process.argv[2] ?? ".build/docs-runtime"),
	);
}
