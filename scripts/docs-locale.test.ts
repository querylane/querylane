import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { LOCALE_REDIRECT_SCRIPT } from "blume/components/layout/locale-redirect.ts";
import config from "../blume.config";

test("enables browser-language routing without advertising unwritten translations", () => {
	expect(config.i18n?.routeByBrowserLanguage).toBe(true);
	expect(config.i18n?.locales).toEqual([{ code: "en", label: "English" }]);
});

// Exercise the native browser script, not a second implementation of matching.
const route = (languages: string[], choice: string | null, referrer = "") => {
	const destinations: string[] = [];
	runInNewContext(LOCALE_REDIRECT_SCRIPT, {
		document: {
			currentScript: { dataset: { default: "en", targets: '{"fr":"/fr"}' } },
			referrer,
		},
		navigator: { languages },
		localStorage: {
			getItem: (key: string) => (key === "blume-locale" ? choice : null),
		},
		location: {
			origin: "https://docs.querylane.net",
			search: "?q=help",
			hash: "#start",
			replace: (url: string) => destinations.push(url),
		},
	});
	return destinations;
};

test("routes a first visit to an available browser language with query and anchor intact", () => {
	expect(route(["fr-CA", "en"], null)).toEqual(["/fr?q=help#start"]);
});

test("remembers manual choices rather than forcing the browser language on returning readers", () => {
	expect(route(["fr-CA"], "en")).toEqual([]);
	expect(route(["en"], "fr")).toEqual([]);
});

test("keeps unsupported locales and internal navigation on the current language", () => {
	expect(route(["de-DE"], null)).toEqual([]);
	expect(route(["fr"], null, "https://docs.querylane.net/get-started")).toEqual(
		[],
	);
});
