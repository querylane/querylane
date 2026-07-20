import { defineConfig } from "blume";

export default defineConfig({
	title: "Querylane",
	description:
		"Customer guides for exploring and operating PostgreSQL with Querylane.",
	logo: "/icon.svg",
	deployment: {
		output: "static",
		site: "https://docs.querylane.net",
	},
	content: {
		root: "docs/site",
	},
	github: {
		owner: "querylane",
		repo: "querylane",
	},
	openapi: {
		enabled: true,
		sources: [
			{
				label: "Querylane API",
				route: "/api",
				spec: "./docs/generated/querylane.openapi.yaml",
			},
		],
	},
	redirects: [
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
		tabs: [
			{ label: "Docs", path: "/" },
			{ label: "API", path: "/api" },
		],
		featured: [
			{ label: "What's new", href: "/changelog", icon: "sparkles" },
			{ label: "Roadmap", href: "/roadmap", icon: "map" },
		],
		sidebar: {
			display: "flat",
		},
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
