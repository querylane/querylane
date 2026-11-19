"use client";

import { Navigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { CreateInstanceConnectionFields } from "@/components/new-instance-connection-fields";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/querylane-ui/card";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";
import { useIsConfigManagedInstances } from "@/hooks/api/console";
import { useCreateInstancePageController } from "@/hooks/use-create-instance-page-controller";
import {
  CreateInstanceActions,
  CreateInstanceAdvancedSection,
  CreateInstanceInlineNotice,
  CreateInstancePageHeader,
} from "@/routes/new-instance-page-ui";

function CreateInstancePage() {
  const isConfigManaged = useIsConfigManagedInstances();
  if (isConfigManaged) {
    return <Navigate replace={true} to="/" />;
  }
  return <CreateInstancePageInner />;
}
function CreateInstancePageInner() {
  const {
    canCreate,
    formErrors,
    formNotice,
    formState,
    handleBack,
    handleCreate,
    handleTestConnection,
    isPending,
    isTesting,
    setLabels,
    showAdvanced,
    testResult,
    toggleAdvanced,
    updateField,
  } = useCreateInstancePageController();
  return (
    <div className="flex min-h-dvh items-start justify-center p-6 lg:p-8">
      <div
        className="w-full max-w-2xl space-y-6"
        data-testid="create-instance-page"
      >
        <CreateInstancePageHeader onBack={handleBack} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center" presentation="icon">
              <Database className="size-4" />
              Managed Postgres connection
            </CardTitle>
            <CardDescription>
              This is the Postgres server you want Querylane to manage, not
              Querylane internal storage from setup.
            </CardDescription>
          </CardHeader>
          <CardContent presentation="spacious">
            <SetupFlowExplainer tone="surface" variant="managed" />
            <CreateInstanceConnectionFields
              formErrors={formErrors}
              formState={formState}
              updateField={updateField}
            />
            <CreateInstanceAdvancedSection
              formErrors={formErrors}
              formState={formState}
              onToggleAdvanced={toggleAdvanced}
              setLabels={setLabels}
              showAdvanced={showAdvanced}
              updateField={updateField}
            />
            <CreateInstanceInlineNotice notice={testResult} />
            <CreateInstanceInlineNotice notice={formNotice} />
            <CreateInstanceActions
              canCreate={canCreate}
              handleCreate={handleCreate}
              handleTestConnection={handleTestConnection}
              isPending={isPending}
              isTesting={isTesting}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { CreateInstancePage };
