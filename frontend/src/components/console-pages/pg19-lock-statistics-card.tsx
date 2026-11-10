import { timestampDate } from "@bufbuild/protobuf/wkt";
import { LockKeyhole } from "lucide-react";
import { observationAvailabilityLabel } from "@/components/console-pages/pg19-observation";
import { Badge } from "@/components/querylane-ui/badge";
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
import { formatInsightMs } from "@/lib/query-insights";
import type {
  LockStatistics,
  LockTypeStatistics,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

function formatLockStatisticsReset(reset: LockTypeStatistics["statsResetAt"]) {
  if (!reset) {
    return "Unknown";
  }
  try {
    const date = timestampDate(reset);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
  } catch {
    return "Unknown";
  }
}

function LockStatisticsTable({ rows }: { rows: LockTypeStatistics[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No lock counters were returned.
      </p>
    );
  }
  return (
    <Table aria-label="Cumulative lock statistics by type">
      <TableHeader>
        <TableRow>
          <TableHead>Lock type</TableHead>
          <TableHead className="text-right">Completed waits</TableHead>
          <TableHead className="text-right">Wait time</TableHead>
          <TableHead className="text-right">
            Fast-path capacity misses
          </TableHead>
          <TableHead>Statistics reset</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.lockType} presentation="static">
            <TableCell presentation="identifier">{row.lockType}</TableCell>
            <TableCell className="text-right" presentation="numeric">
              {row.waits.toLocaleString()}
            </TableCell>
            <TableCell className="text-right" presentation="numeric">
              {formatInsightMs(row.waitTimeMs)}
            </TableCell>
            <TableCell className="text-right" presentation="numeric">
              {row.fastpathExceeded.toLocaleString()}
            </TableCell>
            <TableCell presentation="muted-small">
              {formatLockStatisticsReset(row.statsResetAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Pg19LockStatisticsCard({
  statistics,
}: {
  statistics: LockStatistics | undefined;
}) {
  // Older backends omit this field; older servers explicitly report unsupported.
  // Neither should add an empty PG19-only card to an otherwise healthy page.
  if (
    !statistics ||
    statistics.availability === ObservationAvailability.UNSUPPORTED
  ) {
    return null;
  }
  const available =
    statistics.availability === ObservationAvailability.AVAILABLE;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center" presentation="icon">
          <LockKeyhole aria-hidden="true" className="size-4" />
          Cumulative lock statistics
          {available ? null : (
            <Badge variant="outline">
              {observationAvailabilityLabel(statistics.availability)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Instance-wide counters since each statistics reset, not current
          blockers. Waits count successful lock acquisitions after waiting
          longer than deadlock_timeout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {available ? (
          <LockStatisticsTable rows={statistics.byType} />
        ) : (
          <p className="text-muted-foreground text-sm">
            {statistics.summary.trim() ||
              "Lock statistics could not be observed. No zero counts have been assumed."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { Pg19LockStatisticsCard };
