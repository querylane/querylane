import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
	readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("loads Mermaid fullscreen controls on every docs page", async () => {
	const componentMap = await read("components.ts");

	expect(componentMap).toContain('from "./components/MermaidFullscreen.astro"');
	expect(componentMap).toContain("Footer: MermaidFullscreen");
});

test("opens Mermaid diagrams in an accessible viewport dialog", async () => {
	const component = await read("components/MermaidFullscreen.astro");

	expect(component).toContain('aria-label="Expanded Mermaid diagram"');
	expect(component).toContain('aria-label="Close expanded diagram"');
	expect(component).toContain(
		'button.setAttribute("aria-label", "Expand diagram")',
	);
	expect(component).toContain("dialog.showModal()");
	expect(component).toContain('customElements.whenDefined("blume-mermaid")');
	expect(component).toContain("activeTrigger?.focus()");
});

test("uses the full viewport while keeping diagram controls accessible", async () => {
	const theme = await read("theme.css");

	expect(theme).toContain("width: 100dvw");
	expect(theme).toContain("height: 100dvh");
	expect(theme).toContain("min-height: 44px");
	expect(theme).toContain(":focus-visible");
	expect(theme).toContain("[data-mermaid-fullscreen-canvas] svg");
});

test("packages the Mermaid controls in the docs container", async () => {
	const dockerfile = await read("Dockerfile.docs");

	expect(dockerfile).toContain("COPY components.ts ./");
	expect(dockerfile).toContain("COPY components ./components");
	expect(dockerfile).toContain("COPY theme.css ./");
});
