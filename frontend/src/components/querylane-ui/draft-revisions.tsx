import { createParts } from "@ui-sdk/react/primitive";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { draftRevisions } from "@/features/agent-drafts/draft-revisions";

const parts = createParts(draftRevisions, { root: "div", revision: "button" });
function DraftRevisions({
  className,
  ...props
}: Omit<ComponentProps<typeof parts.Root>, "className"> & {
  className?: string;
}) {
  return (
    <parts.Root
      className={cn("flex max-w-full gap-1 overflow-x-auto p-1", className)}
      {...props}
    />
  );
}
function DraftRevision({
  className,
  ...props
}: Omit<ComponentProps<typeof parts.Revision>, "className"> & {
  className?: string;
}) {
  return (
    <parts.Revision
      className={cn(
        "shrink-0 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-accent",
        className
      )}
      {...props}
    />
  );
}

export { DraftRevision, DraftRevisions };
