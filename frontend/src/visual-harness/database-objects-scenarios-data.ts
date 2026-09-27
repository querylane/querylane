import { create } from "@bufbuild/protobuf";
import type { OtherDatabaseObject } from "@/components/console-pages/database-object-categories";
import type { OtherObjectsSummary } from "@/components/console-pages/other-database-objects-query";
import { ExtensionSchema } from "@/protogen/querylane/console/v1alpha1/extension_pb";

const DATABASE_OBJECTS_PARAMS = { databaseId: "app", instanceId: "prod" };

const DATABASE_OBJECTS_DESIGN_OBJECTS: OtherDatabaseObject[] = [
  {
    badge: "ENUM",
    category: "types",
    detail: "",
    name: "shipping.shipment_status",
    sortKey: "1",
    summary: "booked, in_transit, customs_hold, delayed, delivered, cancelled",
  },
  {
    badge: "DOMAIN",
    category: "types",
    detail: "",
    name: "shipping.weight_class",
    sortKey: "2",
    summary: "numeric CHECK (VALUE > 0 AND VALUE < 100000)",
  },
  {
    badge: "COMPOSITE",
    category: "types",
    detail: "",
    name: "catalog.port_ref",
    sortKey: "3",
    summary: "(code text, name text, tz text)",
  },
  {
    badge: "FUNCTION",
    category: "routines",
    detail: "",
    name: "shipping.route_eta(leg_id bigint)",
    sortKey: "4",
    summary: "interval · plpgsql · stable",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    detail: "CALL partman.run_maintenance_proc()",
    name: "partman-maintenance",
    sortKey: "partman-maintenance",
    status: "ok",
    summary: "0 3 * * * · postgres · app",
  },
];

function toDatabaseObjectsSummary(
  objects: OtherDatabaseObject[]
): OtherObjectsSummary {
  const summary: OtherObjectsSummary = {};
  for (const object of objects) {
    const entry = summary[object.category] ?? { objects: [], total: 0 };
    entry.objects.push(object);
    entry.total = entry.objects.length;
    summary[object.category] = entry;
  }
  return summary;
}

const DATABASE_OBJECTS_DESIGN_EXTENSIONS = [
  create(ExtensionSchema, {
    comment: "cryptographic functions",
    displayName: "pgcrypto",
    installed: true,
    installedVersion: "1.3",
    name: "instances/prod/databases/app/extensions/pgcrypto",
  }),
  create(ExtensionSchema, {
    comment: "PL/pgSQL procedural language",
    displayName: "plpgsql",
    installed: true,
    installedVersion: "1.0",
    name: "instances/prod/databases/app/extensions/plpgsql",
  }),
];

export {
  DATABASE_OBJECTS_DESIGN_EXTENSIONS,
  DATABASE_OBJECTS_DESIGN_OBJECTS,
  DATABASE_OBJECTS_PARAMS,
  toDatabaseObjectsSummary,
};
