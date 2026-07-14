function pageIndexForPageSizeChange({
  nextPageSize,
  pageIndex,
  pageSize,
}: {
  nextPageSize: number;
  pageIndex: number;
  pageSize: number;
}) {
  return Math.floor((pageIndex * pageSize) / nextPageSize);
}

const DEFAULT_PAGE_SIZE = 10;
const MEDIUM_PAGE_SIZE = 25;
const LARGE_PAGE_SIZE = 50;
const HIGH_VOLUME_LARGE_PAGE_SIZE = 100;
const HIGH_VOLUME_EXTRA_LARGE_PAGE_SIZE = 250;
const HIGH_VOLUME_MAX_PAGE_SIZE = 500;
const PAGE_SIZE_OPTIONS = [
  DEFAULT_PAGE_SIZE,
  MEDIUM_PAGE_SIZE,
  LARGE_PAGE_SIZE,
] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

function isPageSize(value: number): value is PageSize {
  return PAGE_SIZE_OPTIONS.some((pageSize) => pageSize === value);
}

const HIGH_VOLUME_PAGE_SIZE_OPTIONS = [
  MEDIUM_PAGE_SIZE,
  LARGE_PAGE_SIZE,
  HIGH_VOLUME_LARGE_PAGE_SIZE,
  HIGH_VOLUME_EXTRA_LARGE_PAGE_SIZE,
  HIGH_VOLUME_MAX_PAGE_SIZE,
] as const;

export type { PageSize };
export {
  DEFAULT_PAGE_SIZE,
  HIGH_VOLUME_PAGE_SIZE_OPTIONS,
  isPageSize,
  PAGE_SIZE_OPTIONS,
  pageIndexForPageSizeChange,
};
