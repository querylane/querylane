"use client";

import { Navigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { SetupFlowExplainer } from "@/components/setup-flow-explainer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CreateInstanceWorkflowState } from "@/features/new-instance-workflow";
import { useIsConfigManagedInstances } from "@/hooks/api/console";
import { CreateInstanceConnectionFields } from "@/routes/new-instance-connection-fields";
import { useCreateInstancePageController } from "@/routes/new-instance-page-controller";
import {
  CreateInstanceActions,
  CreateInstanceAdvancedSection,
  CreateInstanceInlineNotice,
  CreateInstancePageHeader,
} from "@/routes/new-instance-page-ui";

export function CreateInstancePage() {
  const isConfigManaged = useIsConfigManagedInstances();
  if (isConfigManaged) {
    return <Navigate replace={true} to="/" />;
  }
  return <CreateInstancePageInner />;
}
export function CreateInstancePageInner({
  initialState,
}: {
  initialState?: Partial<CreateInstanceWorkflowState> | undefined;
} = {}) {
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
  } = useCreateInstancePageController(initialState);
  return (
    <div className="flex min-h-screen items-start justify-center p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6">
        <CreateInstancePageHeader onBack={handleBack} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" />
              {"Managed Postgres connection"}
            </CardTitle>
            <CardDescription>
              {
                "This is the Postgres server you want Querylane to manage, not Querylane internal storage from setup."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

export type { CreateInstanceWorkflowState as CreateInstancePageState } from "@/features/new-instance-workflow";
