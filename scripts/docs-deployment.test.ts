import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import config from "../blume.config";

const read = (path: string) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("builds canonical server-rendered docs URLs for docs.querylane.net", () => {
	expect(config.deployment).toMatchObject({
		adapter: "node",
		output: "server",
		site: "https://docs.querylane.net",
	});
});

test("hosts the docs MCP endpoint", () => {
	expect(config.deployment).toMatchObject({
		adapter: "node",
		output: "server",
	});
	expect(config.ai?.mcp).toMatchObject({
		enabled: true,
		route: "/mcp",
	});
});

test("pins the Blume 1.2 release and its MCP type patch", async () => {
	const packageFile = JSON.parse(await read("package.json")) as {
		devDependencies?: Record<string, string>;
		patchedDependencies?: Record<string, string>;
	};

	expect(packageFile.devDependencies?.blume).toBe("1.2.0");
	expect(packageFile.patchedDependencies).toEqual({
		"blume@1.2.0": "patches/blume@1.2.0.patch",
	});
});

test("ships the Blume server in a health-checked container", async () => {
	const dockerfile = await read("Dockerfile.docs");

	expect(dockerfile).toContain("FROM --platform=$BUILDPLATFORM oven/bun:");
	expect(dockerfile).toContain("COPY patches ./patches");
	expect(dockerfile.indexOf("COPY patches ./patches")).toBeLessThan(
		dockerfile.indexOf("bun install --frozen-lockfile"),
	);
	expect(dockerfile).toContain("COPY docs/components ./docs/components");
	expect(dockerfile).toContain("COPY docs/generated ./docs/generated");
	expect(dockerfile).toContain("COPY examples ./examples");
	expect(dockerfile).toContain("RUN bun run docs:test:content");
	expect(dockerfile).toContain("RUN bun run docs:build");
	expect(dockerfile).toContain("FROM oven/bun:1.3.14-alpine AS runtime-deps");
	expect(dockerfile).toContain("FROM node:24-alpine");
	expect(dockerfile).toContain(
		"COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules",
	);
	expect(dockerfile).toContain(
		"COPY --from=builder --chown=node:node /app/dist ./dist",
	);
	expect(dockerfile).toContain("ENV HOST=0.0.0.0");
	expect(dockerfile).toContain("ENV PORT=80");
	expect(dockerfile).toContain("USER node");
	expect(dockerfile).toContain("HEALTHCHECK");
	expect(dockerfile).toContain('CMD ["node", "./dist/server/entry.mjs"]');
});

test("audits the built docs site in the container", async () => {
	const [packageFile, dockerfile] = await Promise.all([
		read("package.json"),
		read("Dockerfile.docs"),
	]);

	expect(packageFile).toContain('"docs:audit": "blume audit"');
	expect(dockerfile).toContain(
		"RUN bun run docs:build\nRUN bun run docs:audit",
	);
});

test("type-checks generated docs before the container build", async () => {
	const [packageFile, dockerfile] = await Promise.all([
		read("package.json"),
		read("Dockerfile.docs"),
	]);

	expect(packageFile).toContain('"docs:check": "blume check --strict"');
	expect(dockerfile).toContain(
		"RUN bun run docs:check\nRUN bun run docs:build",
	);
});

test("validates and publishes the rolling docs image", async () => {
	const [ci, publish] = await Promise.all([
		read(".github/workflows/docker-ci.yml"),
		read(".github/workflows/docker-publish.yml"),
	]);

	expect(ci).toContain("validate-docs:");
	expect(ci).toContain("dockerfile: ./Dockerfile.docs");
	expect(publish).toContain("publish-docs:");
	expect(publish).toContain("rolling_tag: docs-edge");
	expect(publish).toContain("sha_prefix: docs-sha-");
});

test("generates API docs with the pinned protobuf toolchain", async () => {
	const [taskfile, template] = await Promise.all([
		read("taskfiles/proto.yaml"),
		read("buf.openapi.gen.yaml"),
	]);

	expect(taskfile).toContain(
		"PATH={{.BUILD_ROOT}}/bin:$PATH bun run docs:api:generate",
	);
	expect(template).toContain(
		"buf.build/community/sudorandom-connect-openapi:v0.25.7",
	);
});
