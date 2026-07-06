import { z } from "zod";

const dataExplorerSearchSchema = z.object({
  category: z.optional(z.string()),
  name: z.optional(z.string()),
  q: z.optional(z.string()),
  schema: z.optional(z.string()),
  tab: z.optional(z.string()),
});

type DataExplorerSearch = z.infer<typeof dataExplorerSearchSchema>;

export type { DataExplorerSearch };
export { dataExplorerSearchSchema };
