import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));

test("Vercel route conversion protects adjacent parameters and preserves captures", () => {
	const { convertRewrites } = require("@vercel/routing-utils");
	const [route] = convertRewrites([
		{ source: "/:a-:b", destination: "/target/:a/:b" },
	]);
	expect(route.dest).toBe("/target/$1/$2");
	expect(new RegExp(route.src).exec("/a-b-c")?.slice(1)).toEqual(["a-b", "c"]);
	const result = execFileSync(
		"node",
		[
			"-e",
			`
		const expression = new RegExp(${JSON.stringify(route.src)});
		if (expression.test('/a' + '-a'.repeat(100000) + '/a')) process.exit(1);
	`,
		],
		{ timeout: 3000 },
	);
	expect(result.length).toBe(0);
});

test("typography handles a flat selector without quadratic CPU exhaustion", () => {
	const utils = require.resolve("@tailwindcss/typography/src/utils.js");
	const result = execFileSync(
		"node",
		[
			"-e",
			`
		const assert = require('node:assert/strict');
		const { commonTrailingPseudos } = require(${JSON.stringify(utils)});
		const selector = '.a'.repeat(100000);
		assert.deepEqual(commonTrailingPseudos(selector + '::before'), ['::before', selector]);
		assert.deepEqual(commonTrailingPseudos('h1::before, h2::before'), ['::before', 'h1, h2']);
	`,
		],
		{ timeout: 3000 },
	);
	expect(result.length).toBe(0);
});
