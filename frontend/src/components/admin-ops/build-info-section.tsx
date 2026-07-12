import { MetadataCard } from "@/components/console-pages/console-layout";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  CONSOLE_CONFIG_STATIC_QUERY_OPTIONS,
  useGetConsoleConfigQuery,
} from "@/hooks/api/console";
import { resolveQuerylaneAboutMetadata } from "@/lib/app-metadata";
import type { AppDatabaseStatus } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { AppDatabaseStatus_State } from "@/protogen/querylane/console/v1alpha1/console_pb";
import packageJson from "../../../package.json" with { type: "json" };

const FRONTEND_PACKAGE_VERSION = packageJson.version;

function MetaDatabaseValue({
  databaseStatus,
}: {
  databaseStatus: AppDatabaseStatus | undefined;
}) {
  switch (databaseStatus?.state) {
    case AppDatabaseStatus_State.READY:
      return (
        <StatusIndicator
          label={`Ready · schema v${databaseStatus.schemaVersion}`}
          status="connected"
        />
      );
    case AppDatabaseStatus_State.ERROR:
      return (
        <StatusIndicator
          label={databaseStatus.error || "Error"}
          status="error"
        />
      );
    case AppDatabaseStatus_State.NOT_CONFIGURED:
      return <StatusIndicator label="Not configured" status="disconnected" />;
    default:
      return <StatusIndicator label="Unknown" status="disconnected" />;
  }
}

export function BuildInfoSection() {
  const { data } = useGetConsoleConfigQuery(
    undefined,
    CONSOLE_CONFIG_STATIC_QUERY_OPTIONS
  );
  const aboutMetadata = resolveQuerylaneAboutMetadata(
    data?.buildInfo,
    FRONTEND_PACKAGE_VERSION
  );

  return (
    <MetadataCard
      items={[
        { label: "Version", value: aboutMetadata.version },
        { label: "Git commit", value: aboutMetadata.gitCommit },
        { label: "Git branch", value: aboutMetadata.gitBranch },
        { label: "Built at", value: aboutMetadata.builtAt },
        {
          label: "Config file",
          value: data?.configFilePath || "—",
        },
        {
          label: "Meta database",
          value: <MetaDatabaseValue databaseStatus={data?.databaseStatus} />,
        },
      ]}
      title="Build & runtime"
    />
  );
}
