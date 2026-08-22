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
	rpcs: {
		kind:
			| "bidirectional-streaming"
			| "client-streaming"
			| "server-streaming"
			| "unary";
		name: string;
	}[];
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

			const rpcs = [
				...body.matchAll(
					/^\s*rpc\s+(\w+)\s*\(\s*(stream\s+)?[^)]+\)\s*returns\s*\(\s*(stream\s+)?/gmu,
				),
			].flatMap((rpc) => {
				const [, rpcName, clientStream, serverStream] = rpc;
				if (!rpcName) {
					return [];
				}

				const kind = clientStream
					? serverStream
						? "bidirectional-streaming"
						: "client-streaming"
					: serverStream
						? "server-streaming"
						: "unary";
				return [{ kind, name: rpcName }];
			});

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
				`  /${service.packageName}.${service.name}/${rpc.name}:`,
			);
			expect(openapi).toContain(`operationId: ${service.name}_${rpc.name}`);
		}
	}
});

test("labels every generated operation with its RPC shape", async () => {
	const services = await readProtoServices();
	const openapi = await readFile(
		join(root, "docs/generated/querylane.openapi.yaml"),
		"utf8",
	);

	for (const service of services) {
		for (const rpc of service.rpcs) {
			const operation = openapi.match(
				new RegExp(
					`  /${service.packageName}\\.${service.name}/${rpc.name}:\\n([\\s\\S]*?)(?=\\n  /|\\ncomponents:)`,
					"u",
				),
			)?.[1];

			expect(operation).toContain(`x-connectrpc-method-kind: ${rpc.kind}`);
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
		codeSamples: ["curl", "js", "go"],
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

test("surfaces the experimental API in the primary navigation", () => {
	expect(config.navigation?.tabs).toEqual([
		{ label: "Docs", path: "/" },
		{ label: "Experimental API", path: "/api" },
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

test("does not preserve routes for removed content pages", () => {
	const redirectedRoutes = new Set(
		(config.redirects ?? []).map((redirect) => redirect.from),
	);
	const removedRoutes = [
		"/get-started/install-querylane",
		"/get-started/local-preview",
		"/get-started/embedded-postgresql",
		"/get-started/external-postgresql",
		"/get-started/manual-yaml",
		"/get-started/register-instance",
		"/get-started/first-successful-session",
		"/get-started/production-deployment",
		"/get-started/troubleshooting",
		"/concepts/how-querylane-works",
		"/operations",
		"/operations/deployment-recipes",
		"/operations/postgresql-permissions",
		"/operations/backup-and-restore",
		"/operations/upgrades-and-rollbacks",
		"/guides/instance-overview",
		"/guides/investigate-slow-database",
		"/guides/find-blocking-sessions",
		"/guides/diagnose-missing-metrics",
		"/guides/activity-and-health",
		"/guides/data-explorer",
		"/guides/export-data-safely",
		"/guides/inspect-row-level-security",
		"/guides/roles-and-access",
		"/guides/audit-table-access",
		"/guides/extensions-and-insights",
		"/why-querylane",
	];

	for (const route of removedRoutes) {
		expect(redirectedRoutes).not.toContain(route);
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
	expect(calling).toContain("grpcurl -plaintext");
	expect(calling).toContain("buf build -o /tmp/querylane.protoset");
	expect(calling).toContain(
		"Packaged builds do not expose gRPC server reflection",
	);

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

test("explains RPC badges with an agent-readable live example", async () => {
	const [calling, example] = await Promise.all([
		readFile(join(apiGuideRoot, "calling-the-api.mdx"), "utf8"),
		readFile(join(root, "examples/rpc-method-kinds.astro"), "utf8"),
	]);

	expect(calling).toContain('<Component path="rpc-method-kinds" />');
	for (const kind of [
		"bidirectional-streaming",
		"client-streaming",
		"server-streaming",
		"unary",
	]) {
		expect(example).toContain(`"x-connectrpc-method-kind": "${kind}"`);
	}
});

test("keeps installation and production setup ahead of product guides", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const mainPages = [
		"index.mdx",
		"install-docker.mdx",
		"install-helm.mdx",
		"configure-querylane.mdx",
		"deploy-querylane.mdx",
		"operate-querylane.mdx",
		"meta.ts",
	];
	const pages = await readdir(getStartedRoot);

	expect(pages.sort()).toEqual(mainPages.sort());
	expect(config.navigation?.sidebar).toMatchObject({
		display: "group",
		items: [
			"/",
			{
				items: [
					"/get-started",
					"/get-started/install-docker",
					"/get-started/install-helm",
					"/get-started/configure-querylane",
					"/get-started/deploy-querylane",
					"/get-started/operate-querylane",
				],
				label: "Get started",
			},
			"/use-querylane",
		],
	});

	const [quickstart, deploy, productGuide] = await Promise.all([
		readFile(join(getStartedRoot, "index.mdx"), "utf8"),
		readFile(join(getStartedRoot, "deploy-querylane.mdx"), "utf8"),
		readFile(join(root, "docs/site/use-querylane.mdx"), "utf8"),
	]);
	expect(quickstart).toContain("## 1. Start Querylane");
	expect(deploy).toContain("## Production shape");
	expect(productGuide).toContain("## What Querylane offers today");
});

test("guides a new user through a successful first session", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const [home, meta, quickstart, apiMeta, callingApi] = await Promise.all([
		readFile(join(root, "docs/site/index.mdx"), "utf8"),
		readFile(join(getStartedRoot, "meta.ts"), "utf8"),
		readFile(join(getStartedRoot, "index.mdx"), "utf8"),
		readFile(join(apiGuideRoot, "meta.ts"), "utf8"),
		readFile(join(apiGuideRoot, "calling-the-api.mdx"), "utf8"),
	]);

	expect(config.description).toContain("Get started");
	expect(home).toContain('href="/get-started"');
	expect(meta).toMatch(
		/"index",\s*"install-docker",\s*"install-helm",\s*"configure-querylane",\s*"deploy-querylane",\s*"operate-querylane"/u,
	);
	for (const destination of [
		"/get-started/install-docker",
		"/get-started/install-helm",
		"/get-started/configure-querylane",
		"/get-started/deploy-querylane",
		"/use-querylane",
	]) {
		expect(quickstart).toContain(destination);
	}
	expect(quickstart).toContain("## You are successful when");
	expect(apiMeta).toContain('title: "Experimental API"');
	expect(callingApi).toContain("alpha integration surface");
});

test("keeps getting-started pages in 1 ordered hierarchy level", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const entries = await readdir(getStartedRoot, { withFileTypes: true });
	expect(entries.filter((entry) => entry.isDirectory())).toEqual([]);
	expect(entries.filter((entry) => entry.name.endsWith(".mdx"))).toHaveLength(6);
});

test("documents the operational lifecycle for self-hosted deployments", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const [deploy, operate] = await Promise.all([
		readFile(join(getStartedRoot, "deploy-querylane.mdx"), "utf8"),
		readFile(join(getStartedRoot, "operate-querylane.mdx"), "utf8"),
	]);

	expect(deploy).toContain("GRANT pg_monitor");
	expect(deploy).toContain("NOBYPASSRLS");
	expect(operate).toContain("pg_dump");
	expect(operate).toContain("QUERYLANE_INSTANCE_SECRET_KEY");
	expect(operate).toContain("migrate status");
	expect(operate).toContain("Restore the pre-upgrade backup");
});

test("keeps deployment recipes generic and customer-facing", async () => {
	const deployment = await readFile(
		join(root, "docs/site/get-started/deploy-querylane.mdx"),
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

test("summarizes product features and common PostgreSQL investigations", async () => {
	const productGuide = await readFile(
		join(root, "docs/site/use-querylane.mdx"),
		"utf8",
	);

	for (const section of [
		"## Start with the instance overview",
		"## Investigate live activity",
		"## Explore structure and rows",
		"## Understand roles and access",
		"## How Querylane compares",
	]) {
		expect(productGuide).toContain(section);
	}
});

test("makes comparison status scannable without relying on color", async () => {
	const productGuide = await readFile(
		join(root, "docs/site/use-querylane.mdx"),
		"utf8",
	);

	for (const status of [
		"✅ Built in",
		"🟡 Varies",
		"🟠 Planned",
		"⚪ Not primary scope",
	]) {
		expect(productGuide).toContain(status);
	}

	expect(productGuide).toContain("Icons supplement the text labels");
});

test("documents automatic embedded setup and full-value exports", async () => {
	const getStartedRoot = join(root, "docs/site/get-started");
	const [configuration, operations, productGuide] = await Promise.all([
		readFile(join(getStartedRoot, "configure-querylane.mdx"), "utf8"),
		readFile(join(getStartedRoot, "operate-querylane.mdx"), "utf8"),
		readFile(join(root, "docs/site/use-querylane.mdx"), "utf8"),
	]);

	expect(configuration).toContain("chooses the first free port");
	expect(configuration).toContain("always creates persistent storage");
	expect(configuration).toContain("port: 0");
	expect(operations).toContain("scans upward automatically");
	expect(productGuide).toContain("Download `bytea` values");
	expect(productGuide).toContain("up to 100 oversized cells");
	expect(productGuide).not.toContain(
		"refuses to export selected rows with truncated values",
	);
});
