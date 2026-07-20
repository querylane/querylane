import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import config from "../blume.config";

const root = join(import.meta.dir, "..");
const protoRoot = join(root, "proto/querylane/console/v1alpha1");
const apiGuideRoot = join(root, "docs/site/guides/api");
const apiGuidePages = [
	"calling-the-api.mdx",
	"pagination-and-filtering.mdx",
	"errors-and-streaming.mdx",
];

type ProtoService = {
	name: string;
	packageName: string;
	rpcs: string[];
	slug: string;
};

const serviceSlug = (name: string) =>
	name
		.replace(/Service$/u, "")
		.replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
		.toLowerCase();

const readProtoServices = async (): Promise<ProtoService[]> => {
	const files = (await readdir(protoRoot)).filter((file) =>
		file.endsWith(".proto"),
	);
	const services: ProtoService[] = [];

	for (const file of files) {
		const source = await readFile(join(protoRoot, file), "utf8");
		const packageName = source.match(/^package\s+([^;]+);/mu)?.[1];
		if (!packageName) {
			continue;
		}

		for (const match of source.matchAll(
			/^service\s+(\w+)\s*\{([\s\S]*?)^\}/gmu,
		)) {
			const [, name, body] = match;
			if (!(name && body)) {
				continue;
			}

			const rpcs = [...body.matchAll(/^\s*rpc\s+(\w+)\s*\(/gmu)].flatMap(
				(rpc) => (rpc[1] ? [rpc[1]] : []),
			);

			services.push({
				name,
				packageName,
				rpcs,
				slug: serviceSlug(name),
			});
		}
	}

	return services.sort((left, right) => left.name.localeCompare(right.name));
};

test("generates an OpenAPI path for every service and RPC", async () => {
	const services = await readProtoServices();
	const openapi = await readFile(
		join(root, "docs/generated/querylane.openapi.yaml"),
		"utf8",
	);

	expect(services).toHaveLength(14);
	expect(openapi).toContain("openapi: 3.1.0");
	expect(openapi).toContain(
		"info:\n  title: Querylane API\n  version: v1alpha1",
	);

	for (const service of services) {
		for (const rpc of service.rpcs) {
			expect(openapi).toContain(
				`  /${service.packageName}.${service.name}/${rpc}:`,
			);
			expect(openapi).toContain(`operationId: ${service.name}_${rpc}`);
		}
	}
});

test("serves the generated spec through Blume's native API reference", () => {
	expect(config.openapi).toEqual({
		enabled: true,
		sources: [
			{
				label: "Querylane API",
				route: "/api",
				spec: "./docs/generated/querylane.openapi.yaml",
			},
		],
	});
});

test("exposes the API reference as its own navigation tab", () => {
	expect(config.navigation?.tabs).toEqual([
		{ label: "Docs", path: "/" },
		{ label: "API", path: "/api" },
	]);
});

test("redirects the previous API pages", async () => {
	const redirects = config.redirects ?? [];
	for (const page of apiGuidePages) {
		const slug = page.replace(/\.mdx$/u, "");
		expect(redirects).toContainEqual({
			from: `/api/${slug}`,
			status: 301,
			to: `/guides/api/${slug}`,
		});
	}

	for (const service of await readProtoServices()) {
		expect(redirects).toContainEqual({
			from: `/api/${service.slug}`,
			status: 301,
			to: "/api",
		});
	}
});

test("keeps API usage guidance alongside the generated reference", async () => {
	const pages = await readdir(apiGuideRoot);
	for (const page of apiGuidePages) {
		expect(pages, `missing ${basename(page)}`).toContain(page);
	}

	const calling = await readFile(
		join(apiGuideRoot, "calling-the-api.mdx"),
		"utf8",
	);
	expect(calling).toContain("curl --fail-with-body");
	expect(calling).toContain("createClient");

	const streaming = await readFile(
		join(apiGuideRoot, "errors-and-streaming.mdx"),
		"utf8",
	);
	for (const rpc of [
		"TableDataService.StreamRows",
		"SQLService.ExecuteQuery",
		"OnboardingService.SetupAppDatabase",
		"OnboardingService.WatchConfigChanges",
	]) {
		expect(streaming).toContain(rpc);
	}
});

test("keeps installation and production setup ahead of product guides", async () => {
	const setupPages = [
		"install-querylane.mdx",
		"production-deployment.mdx",
		"troubleshooting.mdx",
	];
	const pages = await readdir(join(root, "docs/site/get-started"));

	for (const page of setupPages) {
		expect(pages, `missing ${basename(page)}`).toContain(page);
	}
});

test("documents the operational lifecycle for self-hosted deployments", async () => {
	const operationsRoot = join(root, "docs/site/operations");
	const pages = await readdir(operationsRoot);
	const expectedPages = [
		"index.mdx",
		"postgresql-permissions.mdx",
		"backup-and-restore.mdx",
		"upgrades-and-rollbacks.mdx",
		"deployment-recipes.mdx",
	];

	for (const page of expectedPages) {
		expect(pages, `missing ${basename(page)}`).toContain(page);
	}

	const permissions = await readFile(
		join(operationsRoot, "postgresql-permissions.mdx"),
		"utf8",
	);
	expect(permissions).toContain("GRANT pg_monitor");
	expect(permissions).toContain("NOBYPASSRLS");

	const backups = await readFile(
		join(operationsRoot, "backup-and-restore.mdx"),
		"utf8",
	);
	expect(backups).toContain("pg_dump");
	expect(backups).toContain("QUERYLANE_INSTANCE_SECRET_KEY");

	const upgrades = await readFile(
		join(operationsRoot, "upgrades-and-rollbacks.mdx"),
		"utf8",
	);
	expect(upgrades).toContain("migrate status");
	expect(upgrades).toContain("Restore the pre-upgrade backup");
});

test("keeps deployment recipes generic and customer-facing", async () => {
	const deployment = await readFile(
		join(root, "docs/site/operations/deployment-recipes.mdx"),
		"utf8",
	);

	for (const implementationDetail of [
		"distroless",
		"metadata-database leases",
	]) {
		expect(deployment.toLowerCase()).not.toContain(implementationDetail);
	}

	expect(deployment).not.toMatch(
		/\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}\b/u,
	);
	expect(deployment).not.toMatch(/[a-z0-9-]+\.ts\.net/iu);
	expect(deployment).toContain("```nginx\nquerylane.example.com");
});

test("provides task-based guides for common PostgreSQL investigations", async () => {
	const guidesRoot = join(root, "docs/site/guides");
	const pages = await readdir(guidesRoot);
	const expectedPages = [
		"investigate-slow-database.mdx",
		"find-blocking-sessions.mdx",
		"audit-table-access.mdx",
		"inspect-row-level-security.mdx",
		"export-data-safely.mdx",
		"diagnose-missing-metrics.mdx",
	];

	for (const page of expectedPages) {
		expect(pages, `missing ${basename(page)}`).toContain(page);
		const contents = await readFile(join(guidesRoot, page), "utf8");
		expect(contents).toContain("## Before you start");
		expect(contents).toContain("## What to do next");
	}
});
