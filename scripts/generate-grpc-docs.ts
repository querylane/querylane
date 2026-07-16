import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
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

type EnumDescriptor = {
	name: string;
	value?: Array<{ name: string; number: number }>;
};

type MessageDescriptor = {
	enumType?: EnumDescriptor[];
	field?: FieldDescriptor[];
	name: string;
	nestedType?: MessageDescriptor[];
	oneofDecl?: Array<{ name: string }>;
	options?: { mapEntry?: boolean };
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
	enumType?: EnumDescriptor[];
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

type DescriptorIndex = {
	enums: Map<string, EnumDescriptor>;
	messages: Map<string, MessageDescriptor>;
};

const apiGuideSlugs = [
	"calling-the-api",
	"pagination-and-filtering",
	"errors-and-streaming",
];

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

type JsonValue =
	| boolean
	| number
	| string
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const descriptorIndex = (files: FileDescriptor[]): DescriptorIndex => {
	const index: DescriptorIndex = {
		enums: new Map(),
		messages: new Map(),
	};

	const addMessage = (prefix: string, message: MessageDescriptor) => {
		const name = `${prefix}.${message.name}`;
		index.messages.set(name, message);
		for (const enumType of message.enumType ?? []) {
			index.enums.set(`${name}.${enumType.name}`, enumType);
		}
		for (const nested of message.nestedType ?? []) {
			addMessage(name, nested);
		}
	};

	for (const file of files) {
		for (const enumType of file.enumType ?? []) {
			index.enums.set(`${file.package}.${enumType.name}`, enumType);
		}
		for (const message of file.messageType ?? []) {
			addMessage(file.package, message);
		}
	}

	return index;
};

const fieldBehaviors = (field: FieldDescriptor): string[] => {
	const raw = field.options?.["[google.api.field_behavior]"];
	return Array.isArray(raw) ? raw.map(String) : [];
};

const instanceName = "instances/production";
const databaseName = `${instanceName}/databases/app`;
const schemaName = `${databaseName}/schemas/public`;
const tableName = `${schemaName}/tables/orders`;
const roleName = `${instanceName}/roles/app_reader`;
const viewName = `${schemaName}/views/active_orders`;

const resourceExample = (requestName: string, fieldName: string): string => {
	if (fieldName === "target") {
		return instanceName;
	}
	if (fieldName === "database") {
		return "app";
	}

	if (fieldName === "parent") {
		if (
			/ListTable(?:Columns|Constraints|Indexes|Policies|Triggers)/u.test(
				requestName,
			)
		) {
			return tableName;
		}
		if (/List(?:Tables|Views)/u.test(requestName)) {
			return schemaName;
		}
		if (
			/ListSchemas|ListExtensions|ExecuteQuery|ExplainQuery/u.test(requestName)
		) {
			return databaseName;
		}
		if (
			/ListRole(?:Grants|OwnedObjects|DefaultPrivileges)/u.test(requestName)
		) {
			return roleName;
		}
		return instanceName;
	}

	if (/View/u.test(requestName)) {
		return viewName;
	}
	if (/Table|Rows|CellValue/u.test(requestName)) {
		return tableName;
	}
	if (/Schema/u.test(requestName)) {
		return schemaName;
	}
	if (/Role/u.test(requestName)) {
		return roleName;
	}
	if (/Database|Query/u.test(requestName)) {
		return databaseName;
	}
	return instanceName;
};

const stringExample = (requestName: string, fieldName: string): string => {
	if (["name", "parent", "target", "database"].includes(fieldName)) {
		if (requestName === "SetupAppDatabaseRequest" && fieldName === "database") {
			return "querylane";
		}
		return resourceExample(requestName, fieldName);
	}

	const examples: Record<string, string> = {
		column: "id",
		defaultSchema: "public",
		displayName: "Production",
		fullValueToken: "replace-with-token-from-read-rows",
		host: "db.example.com",
		instanceId: "production",
		mode: "persistent",
		password: "replace-me",
		selectedColumns: "id",
		statement: "SELECT current_database();",
		username: "querylane_reader",
	};
	if (requestName === "SetupAppDatabaseRequest") {
		if (fieldName === "host") {
			return "metadata-db.example.com";
		}
		if (fieldName === "username") {
			return "querylane";
		}
	}
	return examples[fieldName] ?? "example";
};

const optionalExampleFields = new Set([
	"analyze",
	"batchSize",
	"buffers",
	"cellValueMode",
	"comparison",
	"defaultSchema",
	"direction",
	"format",
	"instanceId",
	"maxCellBytes",
	"maxRows",
	"maxTotalBytes",
	"nullOrder",
	"pageSize",
	"rowCountMode",
	"rowLimit",
	"selectedColumns",
	"spec",
	"sslMode",
	"step",
	"timeout",
	"validateOnly",
]);

const shouldIncludeExampleField = (
	field: FieldDescriptor,
	message: MessageDescriptor,
	selectedOneofs: Set<number>,
): boolean => {
	const behaviors = fieldBehaviors(field);
	if (behaviors.includes("OUTPUT_ONLY") && !behaviors.includes("IDENTIFIER")) {
		return false;
	}
	if (behaviors.includes("REQUIRED") || behaviors.includes("INPUT_ONLY")) {
		return true;
	}
	if (behaviors.includes("IDENTIFIER")) {
		return true;
	}
	if (field.oneofIndex !== undefined) {
		if (selectedOneofs.has(field.oneofIndex)) {
			return false;
		}
		selectedOneofs.add(field.oneofIndex);
		return true;
	}
	if (message.options?.mapEntry) {
		return true;
	}
	const fieldName = field.jsonName ?? field.name;
	if (fieldName === "orderBy") {
		return field.type === "TYPE_MESSAGE";
	}
	return optionalExampleFields.has(fieldName);
};

const enumExample = (typeName: string, index: DescriptorIndex): JsonValue => {
	const descriptor = index.enums.get(typeName.replace(/^\./u, ""));
	const values = descriptor?.value ?? [];
	return (
		values.find(({ name }) => name.endsWith("_VERIFY_FULL"))?.name ??
		values.find(({ number }) => number !== 0)?.name ??
		values[0]?.name ??
		"UNSPECIFIED"
	);
};

const messageExample = (
	typeName: string,
	requestName: string,
	index: DescriptorIndex,
	depth = 0,
): JsonValue => {
	const normalizedType = typeName.replace(/^\./u, "");
	if (normalizedType === "google.protobuf.Duration") {
		return "30s";
	}
	if (normalizedType === "google.protobuf.FieldMask") {
		return "displayName,config";
	}
	if (normalizedType === "google.protobuf.Timestamp") {
		return "2026-07-17T12:00:00Z";
	}
	if (normalizedType === "google.type.Interval") {
		return {
			endTime: "2026-07-17T12:00:00Z",
			startTime: "2026-07-17T11:00:00Z",
		};
	}
	if (depth > 4) {
		return {};
	}

	const message = index.messages.get(normalizedType);
	if (!message) {
		return {};
	}
	const result: Record<string, JsonValue> = {};
	const selectedOneofs = new Set<number>();
	for (const field of message.field ?? []) {
		if (!shouldIncludeExampleField(field, message, selectedOneofs)) {
			continue;
		}
		const fieldName = field.jsonName ?? field.name;
		let value: JsonValue;
		if (field.type === "TYPE_MESSAGE" && field.typeName) {
			if (field.typeName === ".google.protobuf.Duration") {
				value =
					fieldName === "step"
						? "60s"
						: fieldName === "comparison"
							? "3600s"
							: "30s";
			} else {
				value = messageExample(field.typeName, requestName, index, depth + 1);
			}
		} else if (field.type === "TYPE_ENUM" && field.typeName) {
			value = enumExample(field.typeName, index);
		} else {
			switch (field.type) {
				case "TYPE_BOOL":
					value = false;
					break;
				case "TYPE_DOUBLE":
				case "TYPE_FLOAT":
					value = 1.5;
					break;
				case "TYPE_FIXED32":
				case "TYPE_INT32":
				case "TYPE_SFIXED32":
				case "TYPE_SINT32":
				case "TYPE_UINT32":
					value =
						{
							batchSize: 500,
							maxCellBytes: 8192,
							pageSize: 50,
							port: 5432,
							rowLimit: 100,
						}[fieldName] ?? 50;
					break;
				case "TYPE_FIXED64":
				case "TYPE_INT64":
				case "TYPE_SFIXED64":
				case "TYPE_SINT64":
				case "TYPE_UINT64":
					value =
						{
							maxResponseBytes: "8388608",
							maxRows: "10000",
							maxTotalBytes: "16777216",
						}[fieldName] ?? "1048576";
					break;
				case "TYPE_BYTES":
					value = "ZXhhbXBsZQ==";
					break;
				default:
					value = stringExample(requestName, fieldName);
			}
		}

		if (field.label === "LABEL_REPEATED") {
			value = [value];
		}
		result[fieldName] = value;
	}
	return result;
};

const requestExample = (
	method: MethodDescriptor,
	index: DescriptorIndex,
): string =>
	JSON.stringify(
		messageExample(method.inputType, shortType(method.inputType), index),
		null,
		2,
	);

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

const renderServicePage = (
	page: ServicePage,
	index: DescriptorIndex,
): string => {
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
			"### JSON request example",
			"",
			"The values are illustrative. Replace resource names, identifiers, and credentials for your deployment.",
			"",
			"```json",
			requestExample(method, index),
			"```",
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
		"The JSON examples use protobuf JSON field names and wire encodings. They are request starting points, not production credentials or guaranteed resources.",
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
		"<CardGroup cols={3}>",
		'  <Card title="Call the API" href="/api/calling-the-api" icon="terminal">',
		"    Run unary requests with curl or create a generated TypeScript client.",
		"  </Card>",
		'  <Card title="Page and filter" href="/api/pagination-and-filtering" icon="list-filter">',
		"    Traverse list methods with opaque cursors, stable ordering, and bounded filters.",
		"  </Card>",
		'  <Card title="Handle failures and streams" href="/api/errors-and-streaming" icon="workflow">',
		"    Process Connect codes, partial errors, deadlines, and server streams.",
		"  </Card>",
		"</CardGroup>",
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
		"\torder: 5,",
		"\tpages: [",
		'\t\t"index",',
		...apiGuideSlugs.map((page) => `\t\t"${page}",`),
		...pages.map((page) => `\t\t"${page.slug}",`),
		"\t],",
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

		await mkdir(outputRoot, { recursive: true });
		for (const entry of await readdir(outputRoot)) {
			const path = join(outputRoot, entry);
			if (entry === "meta.ts") {
				await rm(path, { force: true });
				continue;
			}
			if (
				entry.endsWith(".mdx") &&
				(await readFile(path, "utf8")).includes(
					"Generated by `bun run docs:api:generate`",
				)
			) {
				await rm(path, { force: true });
			}
		}
		const index = descriptorIndex(descriptors.file);
		await Promise.all([
			writeFile(join(outputRoot, "index.mdx"), renderIndex(pages)),
			writeFile(join(outputRoot, "meta.ts"), renderMeta(pages)),
			...pages.map((page) =>
				writeFile(
					join(outputRoot, `${page.slug}.mdx`),
					renderServicePage(page, index),
				),
			),
		]);
		console.log(`Generated ${pages.length} API service pages.`);
	} finally {
		await rm(temp, { force: true, recursive: true });
	}
};

await main();
