import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const outputRoot = join(root, "docs/site/api");
const protoPrefix = "querylane/console/v1alpha1/";

type SourceLocation = {
	path?: number[];
	leadingComments?: string;
};

type FieldDescriptor = {
	jsonName?: string;
	label?: string;
	name: string;
	oneofIndex?: number;
	options?: Record<string, unknown>;
	type: string;
	typeName?: string;
};

type MessageDescriptor = {
	field?: FieldDescriptor[];
	name: string;
	oneofDecl?: Array<{ name: string }>;
};

type MethodDescriptor = {
	clientStreaming?: boolean;
	inputType: string;
	name: string;
	outputType: string;
	serverStreaming?: boolean;
};

type ServiceDescriptor = {
	method?: MethodDescriptor[];
	name: string;
};

type FileDescriptor = {
	messageType?: MessageDescriptor[];
	name: string;
	package: string;
	service?: ServiceDescriptor[];
	sourceCodeInfo?: { location?: SourceLocation[] };
};

type DescriptorSet = {
	file: FileDescriptor[];
};

type ServicePage = {
	description: string;
	displayName: string;
	file: FileDescriptor;
	service: ServiceDescriptor;
	slug: string;
};

const scalarTypes: Record<string, string> = {
	TYPE_BOOL: "bool",
	TYPE_BYTES: "bytes",
	TYPE_DOUBLE: "double",
	TYPE_FIXED32: "fixed32",
	TYPE_FIXED64: "fixed64",
	TYPE_FLOAT: "float",
	TYPE_INT32: "int32",
	TYPE_INT64: "int64",
	TYPE_SFIXED32: "sfixed32",
	TYPE_SFIXED64: "sfixed64",
	TYPE_SINT32: "sint32",
	TYPE_SINT64: "sint64",
	TYPE_STRING: "string",
	TYPE_UINT32: "uint32",
	TYPE_UINT64: "uint64",
};

const cleanComment = (value?: string): string =>
	(value ?? "")
		.split("\n")
		.map((line) => line.trim())
		.join(" ")
		.replace(/\s+/gu, " ")
		.replace(/\be\.g\.,?/giu, "for example,")
		.replace(/\bi\.e\.,?/giu, "that is,")
		.trim();

const sentence = (value: string): string => {
	const match = value.match(/^.*?[.!?](?:\s|$)/u);
	return (match?.[0] ?? value).trim();
};

const tableText = (value: string): string =>
	(value || "—")
		.replaceAll("|", "\\|")
		.split(/(`[^`]*`)/gu)
		.map((part) =>
			part.startsWith("`")
				? part
				: part.replaceAll("{", "\\{").replaceAll("}", "\\}"),
		)
		.join("");

const displayName = (name: string): string => {
	const base = name.replace(/Service$/u, "");
	const words = base.match(/[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|\d+/gu) ?? [
		base,
	];
	return words
		.map((word, index) =>
			index === 0 || /^[A-Z]+$/u.test(word) ? word : word.toLowerCase(),
		)
		.join(" ");
};

const slug = (name: string): string =>
	name
		.replace(/Service$/u, "")
		.replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
		.toLowerCase();

const commentMap = (file: FileDescriptor): Map<string, string> =>
	new Map(
		(file.sourceCodeInfo?.location ?? [])
			.filter((location) => location.path && location.leadingComments)
			.map((location) => [
				location.path?.join(".") ?? "",
				cleanComment(location.leadingComments),
			]),
	);

const shortType = (typeName: string): string =>
	typeName.replace(/^\./u, "").split(".").at(-1) ?? typeName;

const fieldType = (field: FieldDescriptor): string => {
	const type = field.typeName
		? shortType(field.typeName)
		: scalarTypes[field.type];
	return `${field.label === "LABEL_REPEATED" ? "repeated " : ""}${type ?? field.type}`;
};

const fieldBehavior = (
	field: FieldDescriptor,
	message: MessageDescriptor,
): string => {
	const raw = field.options?.["[google.api.field_behavior]"];
	const behaviors = Array.isArray(raw) ? raw.map(String) : [];
	const labels = behaviors.map((behavior) =>
		behavior
			.toLowerCase()
			.split("_")
			.map((part, index) =>
				index === 0 ? `${part[0]?.toUpperCase()}${part.slice(1)}` : part,
			)
			.join(" "),
	);
	if (field.oneofIndex !== undefined) {
		const oneof = message.oneofDecl?.[field.oneofIndex]?.name;
		if (oneof) {
			labels.push(`One of ${oneof}`);
		}
	}
	return labels.join(", ") || "—";
};

const messageSection = (
	file: FileDescriptor,
	comments: Map<string, string>,
	typeName: string,
): string => {
	const name = shortType(typeName);
	const index = (file.messageType ?? []).findIndex(
		(message) => message.name === name,
	);
	const message = file.messageType?.[index];
	if (!message) {
		return `\`${name}\` is defined outside this service's source file.`;
	}
	if (!message.field?.length) {
		return `\`${name}\` has no fields.`;
	}

	const rows = message.field.map((field, fieldIndex) => {
		const description = comments.get(`4.${index}.2.${fieldIndex}`) ?? "—";
		return `| \`${field.jsonName ?? field.name}\` | \`${fieldType(field)}\` | ${tableText(fieldBehavior(field, message))} | ${tableText(description)} |`;
	});

	return [
		`\`${name}\``,
		"",
		"| Field | Type | Behavior | Description |",
		"| --- | --- | --- | --- |",
		...rows,
	].join("\n");
};

const rpcMode = (method: MethodDescriptor): string => {
	if (method.clientStreaming && method.serverStreaming) {
		return "Bidirectional stream";
	}
	if (method.clientStreaming) {
		return "Client stream";
	}
	if (method.serverStreaming) {
		return "Server stream";
	}
	return "Unary";
};

const rpcSignature = (method: MethodDescriptor): string => {
	const input = `${method.clientStreaming ? "stream " : ""}${shortType(method.inputType)}`;
	const output = `${method.serverStreaming ? "stream " : ""}${shortType(method.outputType)}`;
	return `rpc ${method.name}(${input}) returns (${output})`;
};

const renderServicePage = (page: ServicePage): string => {
	const { file, service } = page;
	const comments = commentMap(file);
	const serviceIndex = (file.service ?? []).findIndex(
		(candidate) => candidate.name === service.name,
	);
	const methods = service.method ?? [];
	const inventory = methods.map(
		(method) =>
			`| [\`${method.name}\`](#${method.name.toLowerCase()}) | ${rpcMode(method)} | \`${shortType(method.inputType)}\` | \`${shortType(method.outputType)}\` |`,
	);
	const sections = methods.flatMap((method, methodIndex) => {
		const description =
			comments.get(`6.${serviceIndex}.2.${methodIndex}`) ??
			`${method.name} RPC.`;
		const path = `/${file.package}.${service.name}/${method.name}`;
		return [
			`## ${method.name}`,
			"",
			description,
			"",
			"```protobuf",
			rpcSignature(method),
			"```",
			"",
			`- **Procedure:** \`POST ${path}\``,
			`- **Mode:** ${rpcMode(method)}`,
			"",
			"### Request",
			"",
			messageSection(file, comments, method.inputType),
			"",
			"### Response",
			"",
			messageSection(file, comments, method.outputType),
			"",
		];
	});
	const sourceUrl = `https://github.com/querylane/querylane/blob/main/proto/${file.name}`;

	return [
		"---",
		`title: ${page.displayName} service`,
		`description: ${JSON.stringify(sentence(page.description))}`,
		"sidebar:",
		`  label: ${page.displayName}`,
		"---",
		"",
		"{/* Generated by `bun run docs:api:generate`. Edit the protobuf source, not this page. */}",
		"",
		page.description,
		"",
		`- **Package:** \`${file.package}\``,
		`- **Service:** \`${service.name}\``,
		"- **Stability:** `v1alpha1`",
		`- **Source:** [\`${file.name.split("/").at(-1)}\`](${sourceUrl})`,
		"",
		"The field tables show the top-level wire shape. Follow the source link for nested messages, enums, validation constraints, and resource annotations.",
		"",
		"## Endpoints",
		"",
		"| RPC | Mode | Request | Response |",
		"| --- | --- | --- | --- |",
		...inventory,
		"",
		...sections,
	].join("\n");
};

const renderIndex = (pages: ServicePage[]): string => {
	const rows = pages.map(
		(page) =>
			`| [${page.displayName} service](/api/${page.slug}) | ${tableText(sentence(page.description))} | ${page.service.method?.length ?? 0} |`,
	);
	return [
		"---",
		"title: API reference",
		"description: ConnectRPC and gRPC service reference generated from Querylane's v1alpha1 protobuf contract.",
		"sidebar:",
		"  label: API overview",
		"---",
		"",
		"{/* Generated by `bun run docs:api:generate`. Edit the protobuf source, not this page. */}",
		"",
		"Querylane exposes its backend through the `querylane.console.v1alpha1` protobuf package. The same handlers accept the Connect, gRPC, and gRPC-Web protocols.",
		"",
		":::warning",
		"The API is `v1alpha1` and can change before a stable release. Querylane does not currently provide built-in authentication. Keep the server behind a trusted network or an authenticating reverse proxy.",
		":::",
		"",
		"## Call a unary RPC",
		"",
		"Connect unary RPCs use an HTTP `POST` to the fully qualified procedure path. JSON requests need the Connect protocol version header.",
		"",
		"```sh",
		"curl --request POST \\",
		"  --header 'Content-Type: application/json' \\",
		"  --header 'Connect-Protocol-Version: 1' \\",
		"  --data '{}' \\",
		"  http://localhost:8080/querylane.console.v1alpha1.ConsoleService/GetConsoleConfig",
		"```",
		"",
		"Use a generated Connect or gRPC client for streaming methods. Streaming bodies use protocol framing rather than plain newline-delimited JSON. See the [Connect protocol specification](https://connectrpc.com/docs/protocol/) for transport details.",
		"",
		"## Errors",
		"",
		"Unary failures return a Connect error code and message with an appropriate non-200 HTTP status. Validation failures can include field-level details. Streaming failures arrive in the final stream envelope while the HTTP status remains `200`.",
		"",
		"## Services",
		"",
		"| Service | Purpose | RPCs |",
		"| --- | --- | ---: |",
		...rows,
		"",
	].join("\n");
};

const renderMeta = (pages: ServicePage[]): string =>
	[
		"// Generated by `bun run docs:api:generate`. Edit the protobuf source, not this file.",
		'import { defineMeta } from "blume";',
		"",
		"export default defineMeta({",
		'\ttitle: "API",',
		'\ticon: "braces",',
		"\torder: 4,",
		`\tpages: ["index", ${pages.map((page) => `"${page.slug}"`).join(", ")}],`,
		"});",
		"",
	].join("\n");

const main = async () => {
	const temp = await mkdtemp(join(tmpdir(), "querylane-api-docs-"));
	const descriptorPath = join(temp, "descriptors.json");
	try {
		const build = Bun.spawn(
			[
				"buf",
				"build",
				"--as-file-descriptor-set",
				"--exclude-imports",
				"--path",
				"proto/querylane/console/v1alpha1",
				"-o",
				descriptorPath,
			],
			{ cwd: root, stderr: "inherit", stdout: "inherit" },
		);
		if ((await build.exited) !== 0) {
			throw new Error("buf build failed");
		}

		const descriptors = JSON.parse(
			await readFile(descriptorPath, "utf8"),
		) as DescriptorSet;
		const pages = descriptors.file
			.filter((file) => file.name.startsWith(protoPrefix))
			.flatMap((file) => {
				const comments = commentMap(file);
				return (file.service ?? []).map((service, serviceIndex) => {
					const description =
						comments.get(`6.${serviceIndex}`) ?? `${service.name} RPCs.`;
					return {
						description,
						displayName: displayName(service.name),
						file,
						service,
						slug: slug(service.name),
					};
				});
			})
			.sort((left, right) => left.displayName.localeCompare(right.displayName));

		await rm(outputRoot, { force: true, recursive: true });
		await mkdir(outputRoot, { recursive: true });
		await Promise.all([
			writeFile(join(outputRoot, "index.mdx"), renderIndex(pages)),
			writeFile(join(outputRoot, "meta.ts"), renderMeta(pages)),
			...pages.map((page) =>
				writeFile(
					join(outputRoot, `${page.slug}.mdx`),
					renderServicePage(page),
				),
			),
		]);
		console.log(`Generated ${pages.length} API service pages.`);
	} finally {
		await rm(temp, { force: true, recursive: true });
	}
};

await main();
