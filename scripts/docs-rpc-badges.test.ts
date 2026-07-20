import { expect, test } from "bun:test";
import {
	type RpcKind,
	rpcPresentation,
	rpcPresentationForReference,
	withRpcBadges,
} from "../docs/components/openapi/rpc-kind";

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
