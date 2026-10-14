import { create } from "@bufbuild/protobuf";
import { durationFromMs } from "@bufbuild/protobuf/wkt";
import { ExecuteQueryResponseSchema } from "../../protogen/querylane/console/v1alpha1/sql_pb";
import {
  TableCellSchema,
  TableResultRowSchema,
} from "../../protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "../../protogen/querylane/console/v1alpha1/table_pb";

const QUERY_LATENCY_MS = 27.8;
const SHIPMENT_ROWS = [
  ["ML-2026-048292", "Pacific Crest Shipping", "2026-07-06"],
  ["ML-2026-048296", "Pacific Crest Shipping", "2026-07-08"],
];

function workbenchQueryResponses({
  notices = ["using index shipments_status_idx"],
  truncated = false,
}: {
  notices?: string[];
  truncated?: boolean;
} = {}) {
  return [
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "columnMetadata",
        value: {
          columns: ["ref", "carrier", "eta"].map((columnName) => ({
            columnName,
            dataType: columnName === "eta" ? DataType.DATE : DataType.STRING,
            rawType: columnName === "eta" ? "DATE" : "TEXT",
          })),
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "rowBatch",
        value: {
          rows: SHIPMENT_ROWS.map((values, index) =>
            create(TableResultRowSchema, {
              rowKey: `row-${index + 1}`,
              values: values.map((value) =>
                create(TableCellSchema, {
                  value: { kind: { case: "stringValue", value } },
                })
              ),
            })
          ),
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "stats",
        value: {
          latency: durationFromMs(QUERY_LATENCY_MS),
          notices,
          rowCount: BigInt(SHIPMENT_ROWS.length),
          truncated,
        },
      },
    }),
  ];
}

export { workbenchQueryResponses };
