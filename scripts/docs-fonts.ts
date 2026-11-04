import type { BlumeConfig } from "blume";
import manifest from "../frontend/src/fonts/manifest.json";

// Declaration-only integration: font processing is exclusively manual.
// Keep Blume's family, fallback stack, display policy and core-only preload filters.
export const docsFonts: NonNullable<BlumeConfig["integrations"]>[number] = {
	name: "querylane-committed-fonts",
	hooks: {
		"astro:config:setup": ({ config }) => {
			for (const family of config.fonts ?? []) {
				const faces = manifest.families.filter(
					(face) => face.id.startsWith("docs-") && face.family === family.name,
				);
				if (faces.length === 0) {
					continue;
				}
				family.provider = {
					name: "querylane-committed",
					// Bust Astro's font cache whenever manual output changes.
					config: {
						hashes: faces.flatMap((face) =>
							face.outputs.map((part) => part.sha256),
						),
					},
					resolveFont: () => ({
						fonts: faces.flatMap((face) =>
							face.outputs.map((part, index) => ({
								src: [
									{
										url: new URL(`../${part.path}`, import.meta.url).pathname,
										format: "woff2",
									},
								],
								style: face.style,
								weight: face.weight,
								unicodeRange: part.unicode_range.split(","),
								meta: { subset: index === 0 ? "latin" : "extended" },
							})),
						),
					}),
				};
			}
		},
	},
};
