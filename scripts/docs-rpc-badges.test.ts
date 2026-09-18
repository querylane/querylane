import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { visibleOperationParameters } from "../docs/components/openapi/parameters";
import {
	type RpcKind,
	rpcPresentation,
	rpcPresentationForReference,
	withRpcBadges,
} from "../docs/components/openapi/rpc-kind";

test("hides standard Connect transport headers from operation details", () => {
	const applicationHeader = { in: "header", name: "X-Querylane-Tenant" };
	const queryParameter = { in: "query", name: "filter" };

	expect(
		visibleOperationParameters([
			{ in: "header", name: "Connect-Protocol-Version" },
			{ in: "header", name: "Connect-Timeout-Ms" },
			applicationHeader,
			queryParameter,
		]),
	).toEqual([applicationHeader, queryParameter]);
});

test("presents protobuf method cardinality instead of the shared POST transport", () => {
	const expected = new Map<RpcKind, string>([
		["unary", "Unary RPC"],
		["server-streaming", "Server stream"],
		["client-streaming", "Client stream"],
		["bidirectional-streaming", "Bidi stream"],
	]);

	for (const [kind, label] of expected) {
		expect(rpcPresentation({ "x-connectrpc-method-kind": kind })).toMatchObject(
			{ kind, label },
		);
	}
});

test("rejects an operation without generated RPC cardinality", () => {
	expect(() => rpcPresentation({})).toThrow(
		"OpenAPI operation is missing x-connectrpc-method-kind",
	);
});

test("resolves RPC presentation from a parsed OpenAPI reference", () => {
	const document = {
		paths: {
			"/querylane.InstanceService/GetInstance": {
				post: { "x-connectrpc-method-kind": "unary" },
			},
		},
	};

	expect(
		rpcPresentationForReference(document, {
			method: "post",
			path: "/querylane.InstanceService/GetInstance",
		}),
	).toMatchObject({ kind: "unary", label: "Unary RPC" });
});

test("replaces HTTP badges only for known RPC navigation routes", () => {
	const items = [
		{
			children: [
				{
					badge: "POST",
					kind: "page" as const,
					label: "GetInstance",
					pageId: "api-instance-get",
					route: "/api/instance/get-instance",
				},
				{
					badge: "Alpha",
					kind: "page" as const,
					label: "Roadmap",
					pageId: "roadmap",
					route: "/roadmap",
				},
			],
			kind: "group" as const,
			label: "Reference",
		},
	];

	expect(
		withRpcBadges(
			items,
			new Map([["/api/instance/get-instance", "Unary RPC"]]),
		),
	).toEqual([
		{
			children: [
				{
					badge: "Unary RPC",
					kind: "page",
					label: "GetInstance",
					pageId: "api-instance-get",
					route: "/api/instance/get-instance",
				},
				{
					badge: "Alpha",
					kind: "page",
					label: "Roadmap",
					pageId: "roadmap",
					route: "/roadmap",
				},
			],
			kind: "group",
			label: "Reference",
		},
	]);
});

test("preserves non-RPC navigation identity for Blume's deferred group IDs", () => {
	const page = {
		kind: "page" as const,
		label: "Quickstart",
		pageId: "get-started",
		route: "/get-started",
	};
	const items = [{ kind: "group" as const, label: "Docs", children: [page] }];
	const result = withRpcBadges(
		items,
		new Map([["/api/instance/get-instance", "Unary RPC"]]),
	);
	expect(result).toBe(items);
	expect(result[0]).toBe(items[0]);
});

test("keeps Blume authorization and playground behavior in RPC operations", async () => {
	const operation = await readFile(
		new URL("../docs/components/openapi/Operation.astro", import.meta.url),
		"utf8",
	);

	expect(operation).toContain("<Authorization security={security} />");
	expect(operation).toContain("operationModel({");
	expect(operation).toContain("<Playground");
	expect(operation).toContain("spec.playground.enabled");
	expect(operation).toContain("<querylane-operation-panel");
	expect(operation).toContain('import "./go-playground.ts"');
});

test("wraps long RPC summaries and routes in API overview cards", async () => {
	const overview = await readFile(
		new URL(
			"../docs/components/openapi/ApiTagOperations.astro",
			import.meta.url,
		),
		"utf8",
	);

	expect(overview).not.toContain("truncate");
	expect(overview).toContain("break-words");
	expect(overview).toContain("break-all");
});
