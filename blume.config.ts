import { defineConfig } from "blume";

export default defineConfig({
	title: "Querylane",
	description:
		"Customer guides for exploring and operating PostgreSQL with Querylane.",
	logo: "/icon.svg",
	content: {
		root: "docs/site",
	},
	github: {
		owner: "querylane",
		repo: "querylane",
	},
	navigation: {
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
	theme: {
		fonts: {
			display: "geist",
			body: "geist",
			mono: "geist-mono",
		},
	},
});
