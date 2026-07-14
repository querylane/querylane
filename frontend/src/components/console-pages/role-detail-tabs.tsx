"use client";

import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { RoleDefinitionTab } from "@/components/console-pages/role-detail-definition-tab";
import { RoleGrantsTab } from "@/components/console-pages/role-detail-grants-tab";
import { RoleMembershipTab } from "@/components/console-pages/role-detail-membership-tab";
import {
  isSection,
  type RoleDetailViewProps,
} from "@/components/console-pages/role-detail-model";
import { RoleOverviewTab } from "@/components/console-pages/role-detail-overview-tab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RoleAccessMapTab = lazy(() =>
  import("@/components/console-pages/role-access-map-tab").then((module) => ({
    default: module.RoleAccessMapTab,
  }))
);

function RoleAccessMapFallback() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin" />
          {" Loading access map"}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {"Loading role access visualization."}
      </CardContent>
    </Card>
  );
}

function OrdinaryRoleTabs(props: RoleDetailViewProps) {
  const {
    belongsTo,
    grantObjects,
    grantsPartial,
    grantsReady,
    memberRows,
    section,
    setSection,
  } = props;
  return (
    <Tabs
      onValueChange={(value) => {
        if (isSection(value)) {
          setSection(value);
        }
      }}
      value={section}
    >
      <TabsList>
        <TabsTrigger value="overview">{"Overview"}</TabsTrigger>
        <TabsTrigger value="grants">
          {"Grants"}
          {grantsReady && (grantObjects.length > 0 || grantsPartial) ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {grantObjects.length}
              {grantsPartial ? " Partial" : ""}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="members">
          {"Membership"}
          {belongsTo.length + memberRows.length > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {belongsTo.length + memberRows.length}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="access-map">{"Access map"}</TabsTrigger>
        <TabsTrigger value="definition">{"Definition"}</TabsTrigger>
      </TabsList>

      <TabsContent className="mt-3" value="overview">
        <RoleOverviewTab {...props} />
      </TabsContent>

      <TabsContent className="mt-3" value="grants">
        <RoleGrantsTab {...props} />
      </TabsContent>

      <TabsContent className="mt-3" value="members">
        <RoleMembershipTab {...props} />
      </TabsContent>

      <TabsContent className="mt-3" value="access-map">
        <Suspense fallback={<RoleAccessMapFallback />}>
          <RoleAccessMapTab {...props} />
        </Suspense>
      </TabsContent>

      <TabsContent className="mt-3" value="definition">
        <RoleDefinitionTab {...props} />
      </TabsContent>
    </Tabs>
  );
}

export { OrdinaryRoleTabs };
