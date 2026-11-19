import { afterEach, expect, test } from "@rstest/core";

import {
  NAVIGATION_SELECTION_STORAGE_KEY,
  readPersistedNavigationSelectionStore,
  writePersistedNavigationSelectionStore,
} from "./db-persistence";

afterEach(() => {
  sessionStorage.removeItem(NAVIGATION_SELECTION_STORAGE_KEY);
});

test("keeps an older valid database selection when neighboring entries are corrupt", () => {
  sessionStorage.setItem(
    NAVIGATION_SELECTION_STORAGE_KEY,
    '{"inst-1":"not an object","inst-2":null,"inst-3":{"databaseId":"reports"}}'
  );

  const recovered = readPersistedNavigationSelectionStore();
  expect(recovered).toEqual({
    "inst-1": {},
    "inst-2": {},
    "inst-3": { databaseId: "reports" },
  });

  writePersistedNavigationSelectionStore({
    ...recovered,
    "inst-1": { databaseId: "postgres" },
  });
  expect(readPersistedNavigationSelectionStore()["inst-1"]).toEqual({
    databaseId: "postgres",
  });
});
