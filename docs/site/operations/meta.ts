import { defineMeta } from "blume";

export default defineMeta({
	title: "Operations",
	icon: "settings",
	order: 4,
	pages: [
		"index",
		"postgresql-permissions",
		"backup-and-restore",
		"upgrades-and-rollbacks",
		"deployment-recipes",
	],
});
