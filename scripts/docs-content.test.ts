import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..");
const protoRoot = join(root, "proto/querylane/console/v1alpha1");
const apiRoot = join(root, "docs/site/api");
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

test("documents every gRPC service and RPC from the proto contract", async () => {
	const services = await readProtoServices();
	const pages = (await readdir(apiRoot)).filter(
		(file) =>
			file.endsWith(".mdx") &&
			file !== "index.mdx" &&
			!apiGuidePages.includes(file),
	);

	expect(services).toHaveLength(14);
	expect(pages.sort()).toEqual(
		services.map(({ slug }) => `${slug}.mdx`).sort(),
	);

	for (const service of services) {
		const page = await readFile(join(apiRoot, `${service.slug}.mdx`), "utf8");
		for (const rpc of service.rpcs) {
			expect(page).toContain(`/${service.packageName}.${service.name}/${rpc}`);
		}
	}
});

test("adds runnable guidance and JSON examples to the API reference", async () => {
	const pages = await readdir(apiRoot);
	for (const page of apiGuidePages) {
		expect(pages, `missing ${basename(page)}`).toContain(page);
	}

	const services = await readProtoServices();
	for (const service of services) {
		const page = await readFile(join(apiRoot, `${service.slug}.mdx`), "utf8");
		for (const rpc of service.rpcs) {
			const section = page.split(`## ${rpc}\n`)[1]?.split(/^## /mu)[0];
			expect(section, `missing ${rpc} section`).toBeDefined();
			expect(section, `missing ${rpc} JSON example`).toContain(
				"### JSON request example",
			);
		}
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
