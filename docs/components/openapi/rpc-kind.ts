import type { NavNode } from "blume/core/types.ts";

export type RpcKind =
	| "bidirectional-streaming"
	| "client-streaming"
	| "server-streaming"
	| "unary";

type RpcPresentation = {
	className: string;
	kind: RpcKind;
	label: string;
};

type RpcReference = {
	method: string;
	path: string;
};

const presentations: Record<RpcKind, Omit<RpcPresentation, "kind">> = {
	"bidirectional-streaming": {
		className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
		label: "Bidi stream",
	},
	"client-streaming": {
		className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
		label: "Client stream",
	},
	"server-streaming": {
		className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
		label: "Server stream",
	},
	unary: {
		className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
		label: "Unary RPC",
	},
};

const isRpcKind = (value: unknown): value is RpcKind =>
	typeof value === "string" && value in presentations;

export const rpcPresentation = (operation: unknown): RpcPresentation => {
	const kind =
		typeof operation === "object" && operation !== null
			? Reflect.get(operation, "x-connectrpc-method-kind")
			: undefined;
	if (!isRpcKind(kind)) {
		throw new Error("OpenAPI operation is missing x-connectrpc-method-kind");
	}

	return { kind, ...presentations[kind] };
};

const propertyOf = (value: unknown, key: string): unknown =>
	typeof value === "object" && value !== null
		? Reflect.get(value, key)
		: undefined;

export const rpcPresentationForReference = (
	document: unknown,
	reference: RpcReference,
): RpcPresentation =>
	rpcPresentation(
		propertyOf(
			propertyOf(propertyOf(document, "paths"), reference.path),
			reference.method,
		),
	);

export const withRpcBadges = (
	items: NavNode[],
	labelsByRoute: ReadonlyMap<string, string>,
): NavNode[] =>
	items.map((item) => {
		if (item.kind === "page") {
			const badge = labelsByRoute.get(item.route);
			return badge ? { ...item, badge } : item;
		}

		return {
			...item,
			children: withRpcBadges(item.children, labelsByRoute),
		};
	});
