import {
  autovacuumEligibility,
  formatAutovacuumScore,
} from "@/components/console-pages/autovacuum-priorities-model";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/querylane-ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/querylane-ui/table";
import type { AutovacuumPriorities } from "@/protogen/querylane/console/v1alpha1/database_pb";
import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

export function AutovacuumPrioritiesCard({
  priorities,
}: {
  priorities: AutovacuumPriorities | undefined;
}) {
  if (
    !priorities ||
    priorities.availability === ObservationAvailability.UNSUPPORTED
  ) {
    return null;
  }
  const available =
    priorities.availability === ObservationAvailability.AVAILABLE;
  return (
    <Card className="min-w-0 lg:col-start-1">
      <CardHeader>
        <CardTitle>Autovacuum priorities</CardTitle>
        <CardDescription>
          Current scores for up to 10 visible tables in this database. Higher
          scores have higher priority, but this is not the worker’s exact queue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {available && priorities.tables.length > 0 ? (
          <Table aria-label="Autovacuum priorities">
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Current eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priorities.tables.map((table) => (
                <TableRow
                  key={JSON.stringify([table.schemaName, table.tableName])}
                >
                  <TableCell
                    className="max-w-80 wrap-break-word whitespace-normal"
                    presentation="identifier"
                  >
                    {table.schemaName}.{table.tableName}
                  </TableCell>
                  <TableCell presentation="numeric">
                    {formatAutovacuumScore(table.score)}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    <div>{autovacuumEligibility(table)}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      XID {formatAutovacuumScore(table.xidScore)} · MXID{" "}
                      {formatAutovacuumScore(table.mxidScore)} · Vacuum{" "}
                      {formatAutovacuumScore(table.vacuumScore)} · Inserts{" "}
                      {formatAutovacuumScore(table.vacuumInsertScore)} · Analyze{" "}
                      {formatAutovacuumScore(table.analyzeScore)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">
            {available
              ? "No visible vacuumable tables in this database."
              : priorities.summary || "Autovacuum priorities are unavailable."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
