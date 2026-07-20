import { type ComponentOverrides, defineComponents } from "blume";
import MermaidFullscreen from "./components/MermaidFullscreen.astro";

const components: ComponentOverrides = defineComponents({
	layout: {
		Footer: MermaidFullscreen,
	},
});

export default components;
