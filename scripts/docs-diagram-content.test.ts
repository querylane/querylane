import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";

const readPage = (path: string) =>
	readFile(new URL(`../docs/site/${path}`, import.meta.url), "utf8");

const readAsset = (path: string) =>
	readFile(new URL(`../public/images/docs/diagrams/${path}`, import.meta.url));

const expectedDiagrams = [
	{
		page: "concepts/how-querylane-works.mdx",
		diagrams: ["resource-model", "stored-and-live-data"],
		walkthroughs: [
			"Read the hierarchy from left to right",
			"Follow one page load",
		],
	},
	{
		page: "get-started/(deploy-and-maintain)/production-deployment.mdx",
		diagrams: ["production-topology"],
		walkthroughs: ["Follow one browser request from left to right"],
	},
	{
		page: "guides/api/pagination-and-filtering.mdx",
		diagrams: ["cursor-pagination"],
		walkthroughs: ["Walk through one complete traversal"],
	},
	{
		page: "guides/api/errors-and-streaming.mdx",
		diagrams: ["server-stream-lifecycle"],
		walkthroughs: ["Walk through one successful stream"],
	},
	{
		page: "guides/audit-table-access.mdx",
		diagrams: ["table-access-check"],
		walkthroughs: ["Follow one access check from left to right"],
	},
	{
		page: "guides/find-blocking-sessions.mdx",
		diagrams: ["blocking-sessions"],
		walkthroughs: ["Read every arrow from left to right as"],
	},
	{
		page: "guides/inspect-row-level-security.mdx",
		diagrams: ["row-level-security"],
		walkthroughs: ["Follow the decision from left to right"],
	},
] as const;

test("embeds editable Excalidraw diagrams with prose walkthroughs", async () => {
	for (const expected of expectedDiagrams) {
		const source = await readPage(expected.page);

		for (const diagram of expected.diagrams) {
			expect(source, `${expected.page} missing ${diagram}`).toContain(
				`/images/docs/diagrams/${diagram}.svg`,
			);
		}

		for (const walkthrough of expected.walkthroughs) {
			expect(source, `${expected.page} missing walkthrough`).toContain(
				walkthrough,
			);
		}
	}
});

test("ships editable sources beside every rendered diagram", async () => {
	for (const { diagrams } of expectedDiagrams) {
		for (const diagram of diagrams) {
			const [sceneBuffer, svgBuffer] = await Promise.all([
				readAsset(`${diagram}.excalidraw`),
				readAsset(`${diagram}.svg`),
			]);
			const scene = JSON.parse(sceneBuffer.toString()) as {
				elements?: unknown[];
				type?: string;
			};
			const svg = svgBuffer.toString();

			expect(scene.type, `${diagram} source type`).toBe("excalidraw");
			expect(
				scene.elements?.length,
				`${diagram} editable element count`,
			).toBeGreaterThan(3);
			expect(svg, `${diagram} SVG root`).toContain("<svg");
			expect(svg, `${diagram} SVG safety`).not.toContain("<script");
			expect(
				(
					await stat(
						new URL(
							`../public/images/docs/diagrams/${diagram}.svg`,
							import.meta.url,
						),
					)
				).size,
				`${diagram} SVG size`,
			).toBeGreaterThan(500);
		}
	}
});

test("removes Mermaid blocks from the docs site", async () => {
	for (const { page } of expectedDiagrams) {
		expect(await readPage(page)).not.toContain("```mermaid");
	}
});

test("gives detailed Excalidraw diagrams more inline room", async () => {
	const [storedAndLive, serverStream, theme] = await Promise.all([
		readPage("concepts/how-querylane-works.mdx"),
		readPage("guides/api/errors-and-streaming.mdx"),
		readFile(new URL("../theme.css", import.meta.url), "utf8"),
	]);

	for (const source of [storedAndLive, serverStream]) {
		expect(source).toContain('<div class="docs-diagram-wide">');
	}
	expect(theme).toContain(".docs-diagram-wide");
	expect(theme).toContain("width: min(56rem, calc(100vw - 2rem))");
	expect(theme).toContain(".docs-diagram-wide img");
	expect(theme).toContain("width: 100%");
});
