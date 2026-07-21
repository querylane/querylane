import { type ComponentOverrides, defineComponents } from "blume";
import MermaidFullscreen from "./components/MermaidFullscreen.astro";
import ApiTagOperations from "./docs/components/openapi/ApiTagOperations.astro";
import Operation from "./docs/components/openapi/Operation.astro";
import RpcNavTree from "./docs/components/openapi/RpcNavTree.astro";

const components: ComponentOverrides = defineComponents({
	mdx: { ApiTagOperations, Operation },
	layout: {
		Footer: MermaidFullscreen,
		Sidebar: RpcNavTree,
	},
});

export default components;
