import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";

const readPage = (path: string) =>
	readFile(new URL(`../docs/site/${path}`, import.meta.url), "utf8");

const readAsset = (path: string) =>
	readFile(new URL(`../public/images/docs/diagrams/${path}`, import.meta.url));

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
		page: "get-started/deploy-querylane.mdx",
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
		page: "use-querylane.mdx",
		diagrams: [
			"blocking-sessions",
			"table-access-check",
			"row-level-security",
		],
		walkthroughs: [
			"Read every arrow from left to right as",
			"Follow one access check from left to right",
			"Follow the decision from left to right",
		],
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
