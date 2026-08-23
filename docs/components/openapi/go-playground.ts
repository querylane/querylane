import {
	type AuthValue,
	buildRequest,
	type PlaygroundModel,
	type RequestValues,
	redactAuth,
} from "blume/components/openapi/request.ts";
import {
	array,
	boolean,
	object,
	optional,
	string,
	unknown as unknownSchema,
	enum as zEnum,
} from "zod/mini";
import { goSnippet } from "./request-samples.ts";

type FieldValue = boolean | number | string;

const PlaygroundParamSchema = object({
	description: optional(string()),
	enum: optional(array(string())),
	in: zEnum(["path", "query", "header"]),
	name: string(),
	required: boolean(),
	type: string(),
	value: string(),
});

const PlaygroundBodyFieldSchema = object({
	description: optional(string()),
	enum: optional(array(string())),
	name: string(),
	required: boolean(),
	type: string(),
	value: string(),
});

const PlaygroundModelSchema = object({
	auth: array(
		object({
			carrier: object({
				in: zEnum(["header", "query", "cookie"]),
				name: string(),
			}),
			id: string(),
			kind: zEnum(["bearer", "basic", "apiKey", "oauth2"]),
			label: string(),
			placeholder: string(),
			prefix: string(),
		}),
	),
	authOptional: boolean(),
	body: optional(
		object({
			contentType: string(),
			example: string(),
			fields: optional(array(PlaygroundBodyFieldSchema)),
			schema: optional(unknownSchema()),
		}),
	),
	method: string(),
	params: array(PlaygroundParamSchema),
	path: string(),
	servers: array(string()),
});

const coerceField = (raw: string, type: string): FieldValue => {
	if (raw === "") {
		return raw;
	}
	if (type === "number" || type === "integer") {
		const numeric = Number(raw);
		return Number.isNaN(numeric) ? raw : numeric;
	}
	if (type === "boolean" && (raw === "true" || raw === "false")) {
		return raw === "true";
	}
	return raw;
};

export const goSampleForValues = (
	model: PlaygroundModel,
	values: RequestValues,
): string => goSnippet(buildRequest(model, values));

const collectAuth = (
	root: HTMLElement,
	model: PlaygroundModel,
): Record<string, AuthValue> => {
	const values: Record<string, AuthValue> = {};
	for (const input of model.auth) {
		values[input.id] = { value: "" };
	}

	for (const field of root.querySelectorAll<HTMLInputElement>(
		"[data-auth-value]",
	)) {
		const id = field.dataset.authValue;
		if (id && values[id]) {
			values[id].value = field.value;
		}
	}
	for (const field of root.querySelectorAll<HTMLInputElement>(
		"[data-auth-username]",
	)) {
		const id = field.dataset.authUsername;
		if (id && values[id]) {
			values[id].username = field.value;
		}
	}
	for (const field of root.querySelectorAll<HTMLInputElement>(
		"[data-auth-password]",
	)) {
		const id = field.dataset.authPassword;
		if (id && values[id]) {
			values[id].password = field.value;
		}
	}

	return values;
};

const collectBody = (
	root: HTMLElement,
	model: PlaygroundModel,
): string | undefined => {
	const editor = root.querySelector<HTMLTextAreaElement>("[data-body]");
	if (editor) {
		return editor.value;
	}
	if (!model.body?.fields) {
		return undefined;
	}

	const inputs = new Map(
		[
			...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
				"[data-body-field]",
			),
		].map((field) => [field.dataset.bodyField ?? "", field.value]),
	);
	const body: Record<string, FieldValue> = {};
	for (const field of model.body.fields) {
		const raw = inputs.get(field.name) ?? "";
		if (raw === "" && !field.required) {
			continue;
		}
		body[field.name] = coerceField(raw, field.type);
	}

	return Object.keys(body).length > 0
		? JSON.stringify(body, null, 2)
		: undefined;
};

const collectValues = (
	root: HTMLElement,
	model: PlaygroundModel,
): RequestValues => {
	const params = Object.fromEntries(
		[
			...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
				"[data-param]",
			),
		].map((field) => [field.dataset.param ?? "", field.value]),
	);
	const customServer =
		root
			.querySelector<HTMLInputElement>("[data-server-custom]")
			?.value.trim() ?? "";
	const selectedServer =
		root.querySelector<HTMLSelectElement>("[data-server]")?.value ??
		model.servers[0] ??
		"";

	return {
		auth: collectAuth(root, model),
		body: collectBody(root, model),
		params,
		server: customServer || selectedServer,
	};
};

const initializeGoPlayground = (scope: HTMLElement): void => {
	const root = scope.querySelector<HTMLElement>("blume-playground");
	const modelScript = root?.querySelector<HTMLScriptElement>(
		"script[data-playground-model]",
	);
	const goPane = scope.querySelector<HTMLElement>('[data-sample-lang="go"]');
	if (!(root && modelScript && goPane)) {
		return;
	}

	let model: PlaygroundModel;
	try {
		model = PlaygroundModelSchema.parse(
			JSON.parse(modelScript.textContent ?? ""),
		);
	} catch (error) {
		console.error(
			"Could not initialize the Querylane Go request sample.",
			error,
		);
		return;
	}
	const sync = (): void => {
		const values = collectValues(root, model);
		const includeAuth = root.querySelector<HTMLInputElement>(
			"[data-samples-auth]",
		)?.checked;
		const shown = includeAuth ? values : redactAuth(model, values);
		const target = goPane.querySelector("code") ?? goPane;
		target.textContent = goSampleForValues(model, shown);
	};

	root.addEventListener("input", sync);
	root.addEventListener("change", sync);
};

if (
	typeof customElements !== "undefined" &&
	!customElements.get("querylane-operation-panel")
) {
	customElements.define(
		"querylane-operation-panel",
		class extends HTMLElement {
			connectedCallback(): void {
				initializeGoPlayground(this);
			}
		},
	);
}
