import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { resolveListColumns } from "@/lib/list-columns";

function listReadMask(
  selection: readonly string[] | undefined,
  fields: Record<string, readonly string[]>,
  required: readonly string[]
) {
  const visible = resolveListColumns(selection, Object.keys(fields));
  const paths = [
    ...new Set([...required, ...visible.flatMap((id) => fields[id] ?? [])]),
  ].toSorted();
  return create(FieldMaskSchema, { paths });
}

export { listReadMask };
