import {
  act,
  type RenderOptions,
  type RenderResult,
  render as renderReact,
} from "@rstest/browser-react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

async function render(ui: ReactNode, options?: RenderOptions) {
  let result: RenderResult | undefined;
  // Keep the adapter's deferred subscriptions inside one outer act scope.
  await act(async () => {
    result = await renderReact(createElement(TooltipProvider, {}, ui), options);
  });
  if (result === undefined) {
    throw new Error("React render did not complete");
  }
  const mounted = result;
  return {
    ...mounted,
    rerender: async (next: ReactNode) => {
      await act(async () => {
        await mounted.rerender(createElement(TooltipProvider, {}, next));
      });
    },
  };
}

export { render };
