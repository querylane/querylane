import { defineConfig } from "blume";

export default defineConfig({
	title: "Querylane",
	description:
		"Architecture, API, and development references for the Querylane PostgreSQL admin UI.",
	logo: "/icon.svg",
	github: {
		owner: "querylane",
		repo: "querylane",
	},
	navigation: {
		sidebar: {
			display: "group",
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
