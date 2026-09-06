import { afterAll, beforeAll, expect, test } from "bun:test";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import apiRedirects from "../docs/api-redirects.json";

// Exercise the production Node adapter, not the dev server or config objects.
const server = Bun.spawn(["node", "dist/server/entry.mjs"], {
	cwd: new URL("..", import.meta.url).pathname,
	env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
	stdout: "pipe",
	stderr: "inherit",
});
let baseUrl: string;

beforeAll(async () => {
	const timeout = setTimeout(() => server.kill(), 10_000);
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
}, 15_000);

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

test.each(Object.entries(apiRedirects))(
	"redirects published API URL %s to a real operation page",
	async (from, to) => {
		const redirect = await fetch(`${baseUrl}${from}`, { redirect: "manual" });
		expect(redirect.status).toBe(301);
		expect(redirect.headers.get("location")).toBe(to);
		const destination = await fetch(`${baseUrl}${to}`, { redirect: "manual" });
		expect(destination.status).toBe(200);
		expect(destination.headers.get("content-type")).toContain("text/html");
		expect(await destination.text()).toMatch(
			/Unary RPC|Server stream|Client stream|Bidi stream/u,
		);
	},
);

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

test("unknown docs pages fail with 404 rather than a successful fallback", async () => {
	const response = await fetch(
		`${baseUrl}/api/docs/pages/not-a-querylane-page.json`,
	);
	expect(response.status).toBe(404);
});
