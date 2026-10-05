import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { parse } from "node-html-parser";

// Exercise the production Node adapter, not the dev server or config objects.
const server = Bun.spawn(["node", "dist/server/entry.mjs"], {
	cwd: new URL("..", import.meta.url).pathname,
	env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
	stdout: "pipe",
	stderr: "inherit",
});
let baseUrl: string;

beforeAll(async () => {
	const timeout = setTimeout(() => server.kill(), 30_000);
	const lines = createInterface({ input: Readable.fromWeb(server.stdout) });
	try {
		for await (const line of lines) {
			const address = line.match(
				/Server listening on (http:\/\/127\.0\.0\.1:\d+)/u,
			);
			if (address?.[1]) {
				baseUrl = address[1];
				return;
			}
		}
		throw new Error(
			"Docs server exited before becoming ready; run docs:build first.",
		);
	} finally {
		clearTimeout(timeout);
		lines.close();
	}
}, 35_000);

afterAll(async () => {
	server.kill();
	await server.exited;
});

test("search finds a secret-reference name present only in a code block", async () => {
	const response = await fetch(
		`${baseUrl}/api/docs/search?q=PRODUCTION_DATABASE_PASSWORD`,
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		results: expect.arrayContaining([
			expect.objectContaining({ route: "/get-started/configure-querylane" }),
		]),
	});
});

test("llms.txt gives agents terminology, safety boundaries, and deployment links", async () => {
	const response = await fetch(`${baseUrl}/llms.txt`);
	expect(response.status).toBe(200);
	const markdown = await response.text();
	for (const guidance of [
		"Instance = a user-managed PostgreSQL server connection",
		"Database = a database inside an instance",
		"Schema = a namespace inside a database",
		"Meta database = Querylane's own persistence database, not a user instance",
		"read-first preview",
		"Do not assume write operations are supported",
		"/get-started/deploy-querylane",
		"/get-started/operate-querylane",
	]) {
		expect(markdown).toContain(guidance);
	}
});

test("JSON page index advertises a readable Markdown and JSON page", async () => {
	const index = await fetch(`${baseUrl}/api/docs/pages.json`);
	expect(index.status).toBe(200);
	expect(await index.json()).toMatchObject({
		pages: expect.arrayContaining([
			expect.objectContaining({
				route: "/get-started/configure-querylane",
				markdownUrl:
					"https://docs.querylane.net/get-started/configure-querylane.md",
				json: "https://docs.querylane.net/api/docs/pages/get-started/configure-querylane.json",
			}),
		]),
	});
	const page = await fetch(
		`${baseUrl}/api/docs/pages/get-started/configure-querylane.json`,
	);
	expect(page.status).toBe(200);
	expect(await page.json()).toMatchObject({
		route: "/get-started/configure-querylane",
		markdown: expect.stringContaining("PRODUCTION_DATABASE_PASSWORD"),
	});
	const markdown = await fetch(`${baseUrl}/get-started/configure-querylane.md`);
	expect(markdown.status).toBe(200);
	expect(await markdown.text()).toContain("PRODUCTION_DATABASE_PASSWORD");
});

test("API Markdown exposes the callable endpoint instead of an MDX component", async () => {
	const response = await fetch(
		`${baseUrl}/api/instance/instance-service-get-instance.md`,
	);
	expect(response.status).toBe(200);
	const markdown = await response.text();
	expect(markdown).toContain(
		"POST /querylane.console.v1alpha1.InstanceService/GetInstance",
	);
	expect(markdown).not.toContain("<Operation ");
	expect(markdown).not.toContain("Querylane experimental API API");
});

test("unknown docs pages fail with 404 rather than a successful fallback", async () => {
	const response = await fetch(
		`${baseUrl}/api/docs/pages/not-a-querylane-page.json`,
	);
	expect(response.status).toBe(404);
});

test("docs pages expose browser narration, both exports, and the real source edit link", async () => {
	const response = await fetch(`${baseUrl}/get-started/configure-querylane`);
	expect(response.status).toBe(200);
	const page = parse(await response.text());
	expect(page.querySelector("[data-blume-narration-player]")).not.toBeNull();
	expect(page.querySelector("[data-blume-export-pdf]")).not.toBeNull();
	expect(page.querySelector("[data-blume-export-epub]")).not.toBeNull();
	expect(
		page.querySelector(
			'a[href="https://github.com/querylane/querylane/edit/main/docs/site/get-started/configure-querylane.mdx"]',
		),
	).not.toBeNull();
});

test("page metadata uses the source file's last Git commit, not the build date", async () => {
	const lastCommit = execFileSync(
		"git",
		[
			"log",
			"-1",
			"--format=%cI",
			"--",
			"docs/site/get-started/configure-querylane.mdx",
		],
		{ cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
	).trim();
	expect(lastCommit).not.toBe("");
	const response = await fetch(
		`${baseUrl}/api/docs/pages/get-started/configure-querylane.json`,
	);
	expect(response.status).toBe(200);
	const page = await response.json();
	expect(new Date(page.lastModified).getTime()).toBe(
		new Date(lastCommit).getTime(),
	);
});

test("API pages render all 18 native sample languages", async () => {
	const response = await fetch(
		`${baseUrl}/api/instance/instance-service-get-instance`,
	);
	expect(response.status).toBe(200);
	const page = parse(await response.text());
	expect(
		page
			.querySelectorAll("[data-sample-lang]")
			.map((pane) => pane.getAttribute("data-sample-lang")),
	).toEqual([
		"curl",
		"python",
		"js",
		"node",
		"typescript",
		"php",
		"go",
		"java",
		"ruby",
		"powershell",
		"swift",
		"csharp",
		"dotnet",
		"c",
		"cpp",
		"kotlin",
		"rust",
		"dart",
	]);
});
