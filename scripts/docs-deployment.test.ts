import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import config from "../blume.config";

const read = (path: string) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("builds canonical docs URLs for docs.querylane.net", () => {
	expect(config.deployment).toMatchObject({
		output: "static",
		site: "https://docs.querylane.net",
	});
});

test("ships the static Blume output in a health-checked container", async () => {
	const dockerfile = await read("Dockerfile.docs");

	expect(dockerfile).toContain("FROM --platform=$BUILDPLATFORM oven/bun:");
	expect(dockerfile).toContain("COPY docs/components ./docs/components");
	expect(dockerfile).toContain("COPY docs/generated ./docs/generated");
	expect(dockerfile).toContain("RUN bun run docs:test:content");
	expect(dockerfile).toContain("RUN bun run docs:build");
	expect(dockerfile).toContain(
		"COPY --from=builder /app/dist /usr/share/caddy",
	);
	expect(dockerfile).toContain("HEALTHCHECK");
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
