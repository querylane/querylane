import { initTableWorker } from "@tanstack/react-table/experimental-worker-plugin";
import {
  benchmarkColumns,
  benchmarkSharedFeatures,
} from "@/features/data-explorer/data-table-worker-benchmark-config";

initTableWorker({
  columns: benchmarkColumns,
  features: benchmarkSharedFeatures,
});
