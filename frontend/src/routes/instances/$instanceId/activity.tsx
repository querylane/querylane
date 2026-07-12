import { createFileRoute } from "@tanstack/react-router";
import { BackendInstancePage } from "@/components/console-pages/instance-page";

function InstanceActivityPage() {
  const { instanceId } = Route.useParams();
  return <BackendInstancePage instanceId={instanceId} section="activity" />;
}

export const Route = createFileRoute("/instances/$instanceId/activity")({
  component: InstanceActivityPage,
});
