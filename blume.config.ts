import { defineConfig } from "blume";

export default defineConfig({
	title: "Querylane",
	description:
		"Get started, configure, deploy, and operate Querylane safely.",
	logo: "/icon.svg",
	deployment: {
		adapter: "node",
		output: "server",
		site: "https://docs.querylane.net",
	},
	ai: {
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
		...[
			"/get-started/install-querylane",
			"/get-started/local-preview",
			"/get-started/register-instance",
			"/get-started/first-successful-session",
		].map((from) => ({ from, status: 301 as const, to: "/get-started" })),
		...[
			"/get-started/embedded-postgresql",
			"/get-started/external-postgresql",
			"/get-started/manual-yaml",
			"/concepts/how-querylane-works",
		].map((from) => ({
			from,
			status: 301 as const,
			to: "/get-started/configure-querylane",
		})),
		...[
			"/get-started/production-deployment",
			"/operations/deployment-recipes",
			"/operations/postgresql-permissions",
		].map((from) => ({
			from,
			status: 301 as const,
			to: "/get-started/deploy-querylane",
		})),
		...[
			"/get-started/troubleshooting",
			"/operations",
			"/operations/backup-and-restore",
			"/operations/upgrades-and-rollbacks",
		].map((from) => ({
			from,
			status: 301 as const,
			to: "/get-started/operate-querylane",
		})),
		...[
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
		].map((from) => ({ from, status: 301 as const, to: "/use-querylane" })),
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
	theme: {
		fonts: {
			display: "geist",
			body: "geist",
			mono: "geist-mono",
		},
	},
});
