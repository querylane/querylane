import {
	sampleLanguages as blumeSampleLanguages,
	type RequestSample,
	type SampleLanguage,
} from "blume/components/openapi/snippets.ts";

const goString = (value: string): string => JSON.stringify(value);

const goSnippet = (sample: RequestSample): string => {
	const imports = ['\t"net/http"'];
	const body = sample.body
		? `strings.NewReader(${goString(sample.body)})`
		: "nil";
	if (sample.body) {
		imports.push('\t"strings"');
	}

	const lines = [
		"package main",
		"",
		"import (",
		...imports,
		")",
		"",
		"func main() {",
		`\treq, err := http.NewRequest(${goString(sample.method)}, ${goString(sample.url)}, ${body})`,
		"\tif err != nil {",
		"\t\tpanic(err)",
		"\t}",
	];

	for (const [key, value] of Object.entries(sample.headers)) {
		lines.push(`\treq.Header.Set(${goString(key)}, ${goString(value)})`);
	}

	lines.push(
		"",
		"\tresponse, err := http.DefaultClient.Do(req)",
		"\tif err != nil {",
		"\t\tpanic(err)",
		"\t}",
		"\tdefer response.Body.Close()",
		"}",
	);

	return lines.join("\n");
};

const GO_LANGUAGE: SampleLanguage = {
	build: goSnippet,
	id: "go",
	label: "Go",
	lang: "go",
};

export const querylaneSampleLanguages = (ids: string[]): SampleLanguage[] => {
	const wanted = ids.length > 0 ? ids : ["curl", "js", "go"];
	const languages: SampleLanguage[] = [];
	const seen = new Set<string>();

	for (const raw of wanted) {
		const id = raw.toLowerCase() === "golang" ? "go" : raw.toLowerCase();
		const language = id === "go" ? GO_LANGUAGE : blumeSampleLanguages([id])[0];
		if (language && !seen.has(language.id)) {
			seen.add(language.id);
			languages.push(language);
		}
	}

	return languages;
};
