import { createFileRoute } from "@tanstack/react-router";
import { InstanceConfigurationPage } from "@/routes/instances/$instanceId/instance-configuration-page";

export const Route = createFileRoute("/instances/$instanceId/configuration")({
  component: InstanceConfigurationPage,
});
