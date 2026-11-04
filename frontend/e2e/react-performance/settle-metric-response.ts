import type { Response } from "playwright/test";

export async function settleMetricResponses(
  responses: readonly [Pick<Response, "finished">, Pick<Response, "finished">],
  confirmRendered: () => Promise<void>
): Promise<void> {
  await Promise.all(
    responses.map((response) =>
      response.finished().then((error) => {
        if (error) {
          throw error;
        }
        return null;
      })
    )
  );
  await confirmRendered();
}
