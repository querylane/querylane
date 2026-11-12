import {
  CollapsiblePanel as CollapsiblePrimitivePanel,
  Collapsible as CollapsiblePrimitiveRoot,
  CollapsibleTrigger as CollapsiblePrimitiveTrigger,
} from "@ui-sdk/react/collapsible";
import type * as React from "react";

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitiveRoot>) {
  return (
    <CollapsiblePrimitiveRoot data-querylane-slot="collapsible" {...props} />
  );
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitiveTrigger>) {
  return (
    <CollapsiblePrimitiveTrigger
      data-querylane-slot="collapsible-trigger"
      {...props}
    />
  );
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitivePanel>) {
  return (
    <CollapsiblePrimitivePanel
      data-querylane-slot="collapsible-content"
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
