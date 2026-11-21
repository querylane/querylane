import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDocsRuntime } from "./docs-package";

test("packages lazy subpaths, transitive assets and notices without build tooling", async () => {
	const root = await mkdtemp(join(tmpdir(), "docs-package-"));
	const source = join(root, "source");
	const output = join(root, "runtime");
	const files = {
		"dist/server/entry.mjs": 'export const load = () => import("./lazy.mjs");',
		"dist/server/lazy.mjs": 'export { default } from "fixture/subpath.js";',
		"dist/client/index.html": "Querylane",
		"node_modules/fixture/package.json": JSON.stringify({
			name: "fixture",
			type: "module",
			dependencies: { child: "1" },
			devDependencies: { deploy: "1" },
			peerDependencies: { deploy: "1" },
			peerDependenciesMeta: { deploy: { optional: true } },
		}),
		"node_modules/fixture/subpath.js": 'export default () => import("child");',
		"node_modules/fixture/LICENSE": "MIT notice",
		"node_modules/fixture/node_modules/child/package.json":
			'{"name":"child","type":"module","main":"index.js"}',
		"node_modules/fixture/node_modules/child/index.js":
			'import { readFileSync } from "node:fs"; export default readFileSync(new URL("asset.txt", import.meta.url), "utf8");',
		"node_modules/fixture/node_modules/child/asset.txt": "runtime asset",
		"node_modules/deploy/package.json": '{"name":"deploy"}',
	};
	try {
		for (const [name, content] of Object.entries(files)) {
			const file = join(source, name);
			await mkdir(join(file, ".."), { recursive: true });
			await writeFile(file, content);
		}
		await packageDocsRuntime(source, output);
		const result = execFileSync(
			"node",
			[
				"--input-type=module",
				"-e",
				'const { load } = await import("./dist/server/entry.mjs"); console.log((await (await load()).default()).default);',
			],
			{ cwd: output, encoding: "utf8" },
		);
		expect(result.trim()).toBe("runtime asset");
		expect(
			await readFile(join(output, "node_modules/fixture/LICENSE"), "utf8"),
		).toBe("MIT notice");
		expect(
			await Bun.file(join(output, "node_modules/deploy/package.json")).exists(),
		).toBe(false);
		execFileSync(process.execPath, [join(import.meta.dir, "docs-package.ts")], {
			cwd: source,
		});
		expect(
			await Bun.file(
				join(source, ".build/docs-runtime/dist/server/entry.mjs"),
			).exists(),
		).toBe(true);
		await rm(join(source, "node_modules/fixture/node_modules/child"), {
			recursive: true,
		});
		await expect(
			packageDocsRuntime(source, join(root, "broken")),
		).rejects.toThrow("child");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("untraceable emitted dynamic imports fail packaging instead of shipping an incomplete closure", async () => {
	const root = await mkdtemp(join(tmpdir(), "docs-package-"));
	try {
		await mkdir(join(root, "dist/server"), { recursive: true });
		await writeFile(
			join(root, "dist/server/entry.mjs"),
			"export const load = (name) => import(name);",
		);
		await expect(
			packageDocsRuntime(root, join(root, "runtime")),
		).rejects.toThrow("dynamic import");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
