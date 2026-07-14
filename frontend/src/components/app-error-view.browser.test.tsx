import { Code, ConnectError } from "@connectrpc/connect";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { AppErrorView } from "@/components/app-error-view";
import { normalizeAppUiError } from "@/lib/ui-error";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

interface PostgresErrorExample {
  code: Code;
  conditionName: string;
  label: string;
  message: string;
  operation: string;
  sqlstate: string;
}

const POSTGRES_ERROR_EXAMPLES = [
  {
    code: Code.Unauthenticated,
    conditionName: "invalid_password",
    label: "Invalid password",
    message: 'password authentication failed for user "reporting"',
    operation: "connect",
    sqlstate: "28P01",
  },
  {
    code: Code.PermissionDenied,
    conditionName: "insufficient_privilege",
    label: "Permission denied",
    message: "permission denied for table invoices",
    operation: "read_rows",
    sqlstate: "42501",
  },
  {
    code: Code.InvalidArgument,
    conditionName: "syntax_error",
    label: "SQL syntax error",
    message: 'syntax error at or near "FROM"',
    operation: "execute_query",
    sqlstate: "42601",
  },
  {
    code: Code.AlreadyExists,
    conditionName: "unique_violation",
    label: "Unique constraint violation",
    message: 'duplicate key value violates unique constraint "users_email_key"',
    operation: "create_user",
    sqlstate: "23505",
  },
] satisfies readonly PostgresErrorExample[];

function createPostgresError(
  example: PostgresErrorExample,
  version: "before" | "now"
) {
  const wireMessage =
    version === "before"
      ? `PostgreSQL ${example.conditionName} during ${example.operation}`
      : `PostgreSQL ${example.sqlstate}: ${example.message}`;
  const error = new ConnectError(wireMessage, example.code);

  error.details = [
    {
      debug: {
        conditionName: example.conditionName,
        operation: example.operation,
        ...(version === "now"
          ? { serverFields: { message: example.message } }
          : {}),
        sqlstate: example.sqlstate,
        sqlstateClass: example.sqlstate.slice(0, 2),
      },
      type: POSTGRES_DETAIL_TYPE,
      value: new Uint8Array([1]),
    },
  ];

  return normalizeAppUiError(error, {
    source: "connect",
    surface: "inline",
  });
}

test("common PostgreSQL errors show the before and now user experience", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] space-y-5 rounded-2xl border border-border bg-background p-6 text-foreground">
        <header className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            Common PostgreSQL errors
          </h1>
          <p className="text-muted-foreground text-sm">
            Before, users saw the condition and operation. Now, they see the
            exact SQLSTATE and PostgreSQL message.
          </p>
        </header>

        <div className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-1 font-medium text-sm">
          <span aria-hidden="true" />
          <span>Before — condition only</span>
          <span>Now — SQLSTATE and message</span>
        </div>

        <div className="space-y-4">
          {POSTGRES_ERROR_EXAMPLES.map((example) => (
            <section
              className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-4 rounded-xl border border-border bg-muted/20 p-4"
              key={example.sqlstate}
            >
              <div className="pt-3">
                <h2 className="font-medium text-sm">{example.label}</h2>
              </div>
              <AppErrorView
                className="h-full"
                containerClassName="h-full"
                error={createPostgresError(example, "before")}
              />
              <AppErrorView
                className="h-full"
                containerClassName="h-full"
                error={createPostgresError(example, "now")}
              />
            </section>
          ))}
        </div>
      </div>
    </ScreenshotFrame>
  );

  for (const example of POSTGRES_ERROR_EXAMPLES) {
    await expect
      .element(
        page.getByText(
          `PostgreSQL ${example.conditionName} during ${example.operation}`
        )
      )
      .toBeVisible();
    await expect
      .element(
        page.getByText(`PostgreSQL ${example.sqlstate}: ${example.message}`)
      )
      .toBeVisible();
  }
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "postgres-errors-before-now"
  );
});
