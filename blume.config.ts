import { defineConfig } from "blume";
import apiRedirects from "./docs/api-redirects.json";

export default defineConfig({
	title: "Querylane",
	description: "Get started, configure, deploy, and operate Querylane safely.",
	logo: "/icon.svg",
	deployment: {
		adapter: "node",
		output: "server",
		site: "https://docs.querylane.net",
	},
	ai: {
		llmsTxt: {
			details: `Use these docs to evaluate, configure, deploy, and operate Querylane, a self-hosted PostgreSQL administration workspace.

Terminology:
- Instance = a user-managed PostgreSQL server connection (host, port, credentials).
- Database = a database inside an instance, created with CREATE DATABASE.
- Schema = a namespace inside a database, such as public or pg_catalog.
- Meta database = Querylane's own persistence database, not a user instance.

Querylane is a read-first preview. Do not assume write operations are supported merely because an experimental API method exists. Check the documented workflow and its limitations before recommending mutations.

Start with the [quickstart](https://docs.querylane.net/get-started). For production, read [deployment](https://docs.querylane.net/get-started/deploy-querylane) and [operations](https://docs.querylane.net/get-started/operate-querylane): authenticated ingress, least-privilege instance access, metadata backups, and a stable instance secret key. Never request or reproduce real passwords or secret-key values.`,
		},
		mcp: {
			enabled: true,
			route: "/mcp",
		},
	},
	content: {
		root: "docs/site",
	},
	github: {
		owner: "querylane",
		repo: "querylane",
	},
	openapi: {
		codeSamples: ["curl", "js", "go"],
		enabled: true,
		sources: [
			{
				label: "Experimental API",
				route: "/api",
				spec: "./docs/generated/querylane.openapi.yaml",
			},
		],
	},
	redirects: [
		// Preserve published operation URLs after Blume 1.6 split camelCase names.
		...Object.entries(apiRedirects).map(([from, to]) => ({
			from,
			to,
			status: 301 as const,
		})),
		{
			from: "/api/calling-the-api",
			status: 301,
			to: "/guides/api/calling-the-api",
		},
		{
			from: "/api/pagination-and-filtering",
			status: 301,
			to: "/guides/api/pagination-and-filtering",
		},
		{
			from: "/api/errors-and-streaming",
			status: 301,
			to: "/guides/api/errors-and-streaming",
		},
		...[
			"admin",
			"console",
			"database",
			"extension",
			"instance",
			"metrics",
			"onboarding",
			"role",
			"runner",
			"schema",
			"sql",
			"table",
			"table-data",
			"view",
		].map((service) => ({
			from: `/api/${service}`,
			status: 301 as const,
			to: "/api",
		})),
	],
	navigation: {
		featured: [
			{ label: "What's new", href: "/changelog", icon: "sparkles" },
			{ label: "Roadmap", href: "/roadmap", icon: "map" },
		],
		sidebar: {
			display: "group",
			items: [
				"/",
				{
					label: "Get started",
					icon: "rocket",
					collapsed: false,
					items: [
						"/get-started",
						"/get-started/install-docker",
						"/get-started/install-helm",
						"/get-started/configure-querylane",
						"/get-started/deploy-querylane",
						"/get-started/operate-querylane",
					],
				},
				"/use-querylane",
			],
		},
		tabs: [
			{ label: "Docs", path: "/" },
			{ label: "Experimental API", path: "/api" },
		],
	},
	markdown: {
		imageZoom: true,
	},
	seo: {
		og: {
			enabled: false,
		},
	},
	search: {
		indexing: { includeCodeBlocks: true },
	},
	theme: {
		fonts: {
			display: "geist",
			body: "geist",
			mono: "geist-mono",
		},
	},
});
