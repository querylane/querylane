import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { createDarkDiagram } from "./generate-doc-diagram-themes";

const readPage = (path: string) =>
	readFile(new URL(`../docs/site/${path}`, import.meta.url), "utf8");

const readAsset = (path: string) =>
	readFile(new URL(`../public/images/docs/diagrams/${path}`, import.meta.url));

const readScreenshot = (path: string) =>
	readFile(new URL(`../public/images/docs/${path}`, import.meta.url));

type DiagramElement = {
	height?: number;
	id?: string;
	points?: [number, number][];
	type?: string;
	width?: number;
	x?: number;
	y?: number;
};

const segmentCrossesRectangle = (
	[[startX, startY], [endX, endY]]: [[number, number], [number, number]],
	rectangle: Required<Pick<DiagramElement, "height" | "width" | "x" | "y">>,
) => {
	const left = rectangle.x + 1;
	const right = rectangle.x + rectangle.width - 1;
	const top = rectangle.y + 1;
	const bottom = rectangle.y + rectangle.height - 1;

	if (startX === endX) {
		return (
			startX > left &&
			startX < right &&
			Math.max(startY, endY) > top &&
			Math.min(startY, endY) < bottom
		);
	}

	if (startY === endY) {
		return (
			startY > top &&
			startY < bottom &&
			Math.max(startX, endX) > left &&
			Math.min(startX, endX) < right
		);
	}

	return false;
};

const expectedDiagrams = [
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
		page: "use-querylane.mdx",
		diagrams: ["blocking-sessions", "table-access-check", "row-level-security"],
		walkthroughs: [
			"Read every arrow from left to right as",
			"Follow one access check from left to right",
			"Follow the decision from left to right",
		],
	},
] as const;

const expectedScreenshots = [
	{ page: "index.mdx", screenshots: ["instance-overview"] },
	{ page: "get-started/index.mdx", screenshots: ["register-instance"] },
	{
		page: "use-querylane.mdx",
		screenshots: ["instance-overview", "schema-map", "roles-access-map"],
	},
] as const;

const expectThemeImagePair = (
	source: string,
	path: string,
	extension: "png" | "svg",
) => {
	expect(source).toMatch(
		new RegExp(
			`<img(?=[^>]*className="dark:hidden")(?=[^>]*src="${path}\\.${extension}")[^>]*/>`,
		),
	);
	expect(source).toMatch(
		new RegExp(
			`<img(?=[^>]*className="hidden dark:block")(?=[^>]*src="${path}-dark\\.${extension}")[^>]*/>`,
		),
	);
};

test("embeds paired light and dark Excalidraw diagrams with prose walkthroughs", async () => {
	for (const expected of expectedDiagrams) {
		const source = await readPage(expected.page);

		for (const diagram of expected.diagrams) {
			expectThemeImagePair(source, `/images/docs/diagrams/${diagram}`, "svg");
		}

		for (const walkthrough of expected.walkthroughs) {
			expect(source, `${expected.page} missing walkthrough`).toContain(
				walkthrough,
			);
		}
	}
});

test("ships editable sources beside every light and dark rendered diagram", async () => {
	for (const { diagrams } of expectedDiagrams) {
		for (const diagram of diagrams) {
			const [sceneBuffer, lightSvgBuffer, darkSvgBuffer] = await Promise.all([
				readAsset(`${diagram}.excalidraw`),
				readAsset(`${diagram}.svg`),
				readAsset(`${diagram}-dark.svg`),
			]);
			const scene = JSON.parse(sceneBuffer.toString()) as {
				elements?: unknown[];
				type?: string;
			};
			const lightSvg = lightSvgBuffer.toString();
			const darkSvg = darkSvgBuffer.toString();

			expect(scene.type, `${diagram} source type`).toBe("excalidraw");
			expect(
				scene.elements?.length,
				`${diagram} editable element count`,
			).toBeGreaterThan(3);
			for (const [theme, svg] of [
				["light", lightSvg],
				["dark", darkSvg],
			] as const) {
				expect(svg, `${diagram} ${theme} SVG root`).toContain("<svg");
				expect(svg, `${diagram} ${theme} SVG safety`).not.toContain("<script");
				expect(svg.length, `${diagram} ${theme} SVG size`).toBeGreaterThan(500);
			}
			expect(lightSvg, `${diagram} light background`).toContain(
				'fill="#ffffff"',
			);
			expect(darkSvg, `${diagram} dark background`).toContain('fill="#0f172a"');
			expect(darkSvg, `${diagram} generated dark asset`).toBe(
				createDarkDiagram(lightSvg),
			);
		}
	}
});

test("rejects unreviewed colors when generating a dark diagram", () => {
	expect(() =>
		createDarkDiagram(
			'<svg><metadata/><rect fill="#ffffff"/><path stroke="#123456"/></svg>',
		),
	).toThrow("Unsupported light diagram colors: #123456");
});

test("renders every docs screenshot in the active theme", async () => {
	for (const expected of expectedScreenshots) {
		const source = await readPage(expected.page);

		for (const screenshot of expected.screenshots) {
			expectThemeImagePair(source, `/images/docs/${screenshot}`, "png");
		}
	}
});

test("ships equal-size light and dark versions of every docs screenshot", async () => {
	const screenshotDirectory = new URL(
		"../public/images/docs/",
		import.meta.url,
	);
	const screenshotNames = (await readdir(screenshotDirectory)).filter((path) =>
		path.endsWith(".png"),
	);
	const lightScreenshots = screenshotNames
		.filter((path) => !path.endsWith("-dark.png"))
		.toSorted();
	const darkScreenshots = screenshotNames
		.filter((path) => path.endsWith("-dark.png"))
		.map((path) => path.replace(/-dark\.png$/, ".png"))
		.toSorted();

	expect(darkScreenshots).toEqual(lightScreenshots);

	for (const lightName of lightScreenshots) {
		const darkName = lightName.replace(/\.png$/, "-dark.png");
		const [light, dark] = await Promise.all([
			readScreenshot(lightName),
			readScreenshot(darkName),
		]);
		const dimensions = (png: Buffer) => ({
			height: png.readUInt32BE(20),
			width: png.readUInt32BE(16),
		});

		expect(dimensions(dark), `${darkName} dimensions`).toEqual(
			dimensions(light),
		);
		expect(dark.equals(light), `${darkName} uses the dark theme`).toBeFalse();
	}
});

test("removes Mermaid blocks from the docs site", async () => {
	for (const { page } of expectedDiagrams) {
		expect(await readPage(page)).not.toContain("```mermaid");
	}
});

test("gives detailed Excalidraw diagrams more inline room", async () => {
	const [serverStream, theme] = await Promise.all([
		readPage("guides/api/errors-and-streaming.mdx"),
		readFile(new URL("../theme.css", import.meta.url), "utf8"),
	]);

	expect(serverStream).toContain('<div class="docs-diagram-wide">');
	expect(theme).toContain(".docs-diagram-wide");
	expect(theme).toContain("width: min(56rem, calc(100vw - 2rem))");
	expect(theme).toContain(".docs-diagram-wide img");
	expect(theme).toContain("width: 100%");
});

test("routes cursor pagination retry edges around nodes", async () => {
	const scene = JSON.parse(
		(await readAsset("cursor-pagination.excalidraw")).toString(),
	) as { elements?: DiagramElement[] };
	const elements = scene.elements ?? [];
	const nodes = elements.filter(
		(
			element,
		): element is DiagramElement &
			Required<Pick<DiagramElement, "height" | "id" | "width" | "x" | "y">> =>
			element.type === "rectangle" &&
			element.id !== "canvas" &&
			typeof element.id === "string" &&
			typeof element.x === "number" &&
			typeof element.y === "number" &&
			typeof element.width === "number" &&
			typeof element.height === "number",
	);

	for (const arrowId of ["keep-loop", "restart-loop"]) {
		const arrow = elements.find((element) => element.id === arrowId);
		expect(arrow?.type, `${arrowId} type`).toBe("arrow");
		expect(arrow?.points, `${arrowId} points`).toBeDefined();
		expect(arrow?.x, `${arrowId} x`).toBeNumber();
		expect(arrow?.y, `${arrowId} y`).toBeNumber();

		if (
			!arrow?.points ||
			typeof arrow.x !== "number" ||
			typeof arrow.y !== "number"
		) {
			continue;
		}

		const collisions = nodes.flatMap((node) =>
			arrow.points?.some((point, index, points) => {
				const nextPoint = points[index + 1];
				if (!nextPoint) {
					return false;
				}

				return segmentCrossesRectangle(
					[
						[arrow.x + point[0], arrow.y + point[1]],
						[arrow.x + nextPoint[0], arrow.y + nextPoint[1]],
					],
					node,
				);
			})
				? [node.id]
				: [],
		);

		expect(collisions, `${arrowId} crosses nodes`).toEqual([]);
	}
});
