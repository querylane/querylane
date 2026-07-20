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
		"info:\n  title: Querylane experimental API\n  version: v1alpha1",
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

test("renders protobuf well-known scalars as concise OpenAPI strings", async () => {
	const openapi = await readFile(
		join(root, "docs/generated/querylane.openapi.yaml"),
		"utf8",
	);

	for (const schema of ["Duration", "FieldMask", "Timestamp"]) {
		expect(openapi).not.toContain(
			`$ref: '#/components/schemas/google.protobuf.${schema}'`,
		);
	}

	const retentionPeriod = openapi.match(
		/ {8}retentionPeriod:\n([\s\S]*?)\n {6}title: GetMetricsStorageStatsResponse/u,
	)?.[1];
	expect(retentionPeriod).toContain(
		"Output-only. Maximum age of retained samples",
	);
	expect(retentionPeriod).toContain("          type: string");
	expect(retentionPeriod).toContain("          format: duration");
});

test("serves the generated spec through Blume's native API reference", () => {
	expect(config.openapi).toEqual({
		enabled: true,
		sources: [
			{
				label: "Experimental API",
				route: "/api",
				spec: "./docs/generated/querylane.openapi.yaml",
			},
		],
	});
});

test("keeps the alpha API reference out of the primary navigation", () => {
	expect(config.navigation?.tabs).toBeUndefined();
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
	const pages = await readdir(join(root, "docs/site/get-started"), {
		recursive: true,
	});

	for (const page of setupPages) {
		expect(
			pages.some((candidate) => basename(candidate) === page),
			`missing ${basename(page)}`,
		).toBe(true);
	}
});

test("guides a new user through a successful first session", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const [home, meta, firstSession, apiMeta, callingApi] = await Promise.all([
		readFile(join(root, "docs/site/index.mdx"), "utf8"),
		readFile(join(getStartedRoot, "(connect-and-explore)/meta.ts"), "utf8"),
		readFile(
			join(
				getStartedRoot,
				"(connect-and-explore)/first-successful-session.mdx",
			),
			"utf8",
		),
		readFile(join(apiGuideRoot, "meta.ts"), "utf8"),
		readFile(join(apiGuideRoot, "calling-the-api.mdx"), "utf8"),
	]);

	expect(config.description).toContain("getting started");
	expect(home).toContain("/get-started/first-successful-session");
	expect(meta).toMatch(/"register-instance",\s*"first-successful-session"/u);
	for (const destination of [
		"/guides/instance-overview",
		"/guides/find-blocking-sessions",
		"/guides/roles-and-access",
		"/operations/postgresql-permissions",
	]) {
		expect(firstSession).toContain(destination);
	}
	expect(firstSession).toContain("## You are successful when");
	expect(apiMeta).toContain('title: "Experimental API"');
	expect(callingApi).toContain("alpha integration surface");
});

test("groups getting-started pages into an ordered hierarchy", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const groups = [
		{
			folder: "(install-and-run)",
			key: "install-and-run",
			pages: ["install-querylane", "local-preview"],
			title: "Install and run",
		},
		{
			folder: "(configure-storage)",
			key: "configure-storage",
			pages: ["embedded-postgresql", "external-postgresql", "manual-yaml"],
			title: "Configure storage",
		},
		{
			folder: "(connect-and-explore)",
			key: "connect-and-explore",
			pages: ["register-instance", "first-successful-session"],
			title: "Connect and explore",
		},
		{
			folder: "(deploy-and-maintain)",
			key: "deploy-and-maintain",
			pages: ["production-deployment", "troubleshooting"],
			title: "Deploy and maintain",
		},
	];

	expect(config.navigation?.sidebar).toMatchObject({ display: "group" });

	const parentMeta = await readFile(join(getStartedRoot, "meta.ts"), "utf8");
	for (const group of groups) {
		expect(parentMeta).toContain(`"${group.key}"`);
		const [groupMeta, files] = await Promise.all([
			readFile(join(getStartedRoot, group.folder, "meta.ts"), "utf8"),
			readdir(join(getStartedRoot, group.folder)),
		]);

		expect(groupMeta).toContain(`title: "${group.title}"`);
		for (const page of group.pages) {
			expect(groupMeta).toContain(`"${page}"`);
			expect(files).toContain(`${page}.mdx`);
		}
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
