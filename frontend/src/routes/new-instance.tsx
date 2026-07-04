import { createFileRoute } from "@tanstack/react-router";
import { CreateInstancePage } from "@/routes/new-instance-page";

export const Route = createFileRoute("/new-instance")({
  component: CreateInstancePage,
});
