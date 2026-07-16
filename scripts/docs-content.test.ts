import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..");
const protoRoot = join(root, "proto/querylane/console/v1alpha1");
const apiRoot = join(root, "docs/site/api");

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
		(file) => file.endsWith(".mdx") && file !== "index.mdx",
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
