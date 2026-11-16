import { createFileRoute } from "@tanstack/react-router";
import { BackendInstancePage } from "@/components/console-pages/instance-page";

import { instanceDatabasesSearchSchema } from "@/lib/metadata-table-search";

function InstancePage() {
  const { instanceId } = Route.useParams();
  return (
    <BackendInstancePage
      instanceId={instanceId}
      searchRoute={Route.fullPath}
      section="overview"
    />
  );
}

export const Route = createFileRoute("/instances/$instanceId/")({
  component: InstancePage,
  validateSearch: instanceDatabasesSearchSchema,
});
