import { defineComponents } from "blume";
import ApiTagOperations from "./docs/components/openapi/ApiTagOperations.astro";
import Operation from "./docs/components/openapi/Operation.astro";
import RpcNavTree from "./docs/components/openapi/RpcNavTree.astro";

export default defineComponents({
	mdx: { ApiTagOperations, Operation },
	layout: {
		Sidebar: RpcNavTree,
	},
});
