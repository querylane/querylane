import type { TableIndex } from "@/protogen/querylane/console/v1alpha1/table_pb";

function isConcurrentRefreshReady(
  isPopulated: boolean,
  indexes: readonly TableIndex[]
): boolean {
  return (
    isPopulated &&
    indexes.some(
      (index) =>
        index.isUnique &&
        index.isValid &&
        !index.hasExpression &&
        index.predicate.trim() === ""
    )
  );
}

export { isConcurrentRefreshReady };
