import { BuildInfoSection } from "@/components/admin-ops/build-info-section";
import { CatalogSyncSection } from "@/components/admin-ops/catalog-sync-section";
import { JobQueueSection } from "@/components/admin-ops/job-queue-section";
import { ReplicasSection } from "@/components/admin-ops/replicas-section";
import { StorageSection } from "@/components/admin-ops/storage-section";
import { PageHeader } from "@/components/console-pages/console-layout";
import { DatabaseLayout } from "@/components/database-layout";

/**
 * Operations page content for querylane's own backend: replicas, the runner
 * job queue, catalog sync state, metrics storage, and build info. Rendered
 * both at /admin (no instance selected) and /instances/$instanceId/admin
 * (keeps the instance context and sidebar). Reachable by everyone for now;
 * once authn/authz lands this page (and the AdminService behind it) will be
 * restricted to admins.
 */
export function AdminOpsSections() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        description="Operational state of the querylane backend itself: replicas, background job scheduling, catalog sync, and metrics storage."
        eyebrow="System"
        title="Admin"
      />
      <ReplicasSection />
      <JobQueueSection />
      <CatalogSyncSection />
      <StorageSection />
      <BuildInfoSection />
    </div>
  );
}

/** Top-level /admin route: provides its own app shell (no instance in URL). */
export function AdminOpsRoutePage() {
  return (
    <DatabaseLayout>
      <AdminOpsSections />
    </DatabaseLayout>
  );
}
