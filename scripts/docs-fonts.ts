import type { BlumeConfig } from "blume";
import manifest from "../docs/fonts/manifest.json";

// Declare committed assets; font processing only runs in scripts/fonts/optimize.py.
export const docsFonts: NonNullable<BlumeConfig["integrations"]>[number] = {
	name: "querylane-committed-fonts",
	hooks: {
		"astro:config:setup": ({ config }) => {
			for (const family of config.fonts ?? []) {
				const faces = manifest.filter((face) => face.family === family.name);
				if (faces.length === 0) {
					continue;
				}
				family.provider = {
					name: "querylane-committed",
					config: { hashes: faces.map((face) => face.sha256) },
					resolveFont: () => ({
						fonts: faces.map((face) => ({
							src: [
								{
									url: new URL(`../${face.path}`, import.meta.url).pathname,
									format: "woff2",
								},
							],
							style: face.style,
							weight: face.weight,
							unicodeRange: face.unicodeRange.split(","),
							meta: { subset: face.subset },
						})),
					}),
				};
			}
		},
	},
};
