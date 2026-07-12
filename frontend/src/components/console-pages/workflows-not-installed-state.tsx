"use client";

import { Link } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function WorkflowsNotInstalledState({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return (
    <EmptyState
      action={
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          params={{ databaseId, instanceId }}
          to="/instances/$instanceId/databases/$databaseId/extensions"
        >
          View extensions
        </Link>
      }
      description="Durable workflows need the pg_durable extension, which is not installed in this database. Installing it requires adding pg_durable to shared_preload_libraries and restarting PostgreSQL, so it cannot be enabled from here."
      icon={PackageOpen}
      title="pg_durable is not installed"
    />
  );
}

export { WorkflowsNotInstalledState };
