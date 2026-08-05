import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
	readFile(new URL(`../docs/site/${path}`, import.meta.url), "utf8");

const expectedDiagrams = [
	{
		page: "concepts/how-querylane-works.mdx",
		types: ["flowchart TD", "sequenceDiagram"],
		walkthroughs: [
			"Read the hierarchy from top to bottom",
			"Follow one page load",
		],
	},
	{
		page: "get-started/(deploy-and-maintain)/production-deployment.mdx",
		types: ["flowchart TD"],
		walkthroughs: ["Follow one browser request from top to bottom"],
	},
	{
		page: "guides/api/pagination-and-filtering.mdx",
		types: ["flowchart TD"],
		walkthroughs: ["Walk through one complete traversal"],
	},
	{
		page: "guides/api/errors-and-streaming.mdx",
		types: ["sequenceDiagram"],
		walkthroughs: ["Walk through one successful stream"],
	},
	{
		page: "guides/audit-table-access.mdx",
		types: ["flowchart TD"],
		walkthroughs: ["Follow one access check from top to bottom"],
	},
	{
		page: "guides/find-blocking-sessions.mdx",
		types: ["flowchart TD"],
		walkthroughs: ["Read every arrow from top to bottom as"],
	},
	{
		page: "guides/inspect-row-level-security.mdx",
		types: ["flowchart TD"],
		walkthroughs: ["Follow the decision from top to bottom"],
	},
] as const;

test("adds focused diagrams and prose walkthroughs to complex existing pages", async () => {
	for (const expected of expectedDiagrams) {
		const source = await read(expected.page);
		const blocks = [...source.matchAll(/```mermaid\n([\s\S]*?)\n```/gu)];

		expect(blocks.length, `${expected.page} Mermaid block count`).toBe(
			expected.types.length,
		);

		for (const type of expected.types) {
			expect(source, `${expected.page} missing ${type}`).toContain(
				`\`\`\`mermaid\n${type}`,
			);
		}

		for (const walkthrough of expected.walkthroughs) {
			expect(source, `${expected.page} missing walkthrough`).toContain(
				walkthrough,
			);
		}
	}
});

test("replaces the production ASCII topology with the theme-aware diagram", async () => {
	const source = await read(
		"get-started/(deploy-and-maintain)/production-deployment.mdx",
	);

	expect(source).not.toContain("```text\nUsers");
	expect(source).toContain("Metadata PostgreSQL");
	expect(source).toContain("Managed instances");
});

test("gives sequence diagrams more inline room", async () => {
	const [storedAndLive, serverStream, theme] = await Promise.all([
		read("concepts/how-querylane-works.mdx"),
		read("guides/api/errors-and-streaming.mdx"),
		readFile(new URL("../theme.css", import.meta.url), "utf8"),
	]);

	for (const source of [storedAndLive, serverStream]) {
		expect(source).toContain(
			'<div class="docs-diagram-wide">\n\n```mermaid\nsequenceDiagram',
		);
	}
	expect(theme).toContain(".docs-diagram-wide");
	expect(theme).toContain("width: min(56rem, calc(100vw - 2rem))");
	expect(theme).toContain(".docs-diagram-wide blume-mermaid > div");
	expect(theme).toContain("width: calc(100% - 5rem)");
});
