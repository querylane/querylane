import { useParams } from "@tanstack/react-router";
import { BackendInstancePage } from "@/components/console-pages/instance-page";

export function InstanceConfigurationPage() {
  const { instanceId } = useParams({
    from: "/instances/$instanceId/configuration",
  });
  return (
    <BackendInstancePage instanceId={instanceId} section="configuration" />
  );
}
