interface TableDetailPreloadSearch {
  category?: string | undefined;
  name?: string | undefined;
  schema?: string | undefined;
}

let tableDetailPreloadPromise: Promise<unknown> | undefined;

function shouldPreloadTableDetail(search: TableDetailPreloadSearch) {
  return Boolean(
    search.category === "tables" && search.name?.trim() && search.schema?.trim()
  );
}

function preloadTableDetail() {
  tableDetailPreloadPromise ??= import(
    "@/features/data-explorer/explorer-table-detail"
  ).catch((error: unknown) => {
    tableDetailPreloadPromise = undefined;
    throw error;
  });
  return tableDetailPreloadPromise;
}

function preloadSelectedTableDetail(search: TableDetailPreloadSearch) {
  if (!shouldPreloadTableDetail(search)) {
    return;
  }

  preloadTableDetail().catch(() => undefined);
}

export { preloadSelectedTableDetail, shouldPreloadTableDetail };
