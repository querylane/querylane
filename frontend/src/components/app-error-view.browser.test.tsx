import { create, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { AppErrorView } from "@/components/app-error-view";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

interface PostgresErrorExample {
  code: Code;
  conditionName: string;
  kind: PostgreSqlErrorKind;
  label: string;
  message: string;
  operation: string;
  sqlstate: string;
}

const POSTGRES_ERROR_EXAMPLES = [
  {
    code: Code.Unauthenticated,
    conditionName: "invalid_password",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED,
    label: "Invalid password",
    message: 'password authentication failed for user "reporting"',
    operation: "connect",
    sqlstate: "28P01",
  },
  {
    code: Code.PermissionDenied,
    conditionName: "insufficient_privilege",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_PERMISSION_DENIED,
    label: "Permission denied",
    message: "permission denied for table invoices",
    operation: "read_rows",
    sqlstate: "42501",
  },
  {
    code: Code.InvalidArgument,
    conditionName: "syntax_error",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_INVALID_ARGUMENT,
    label: "SQL syntax error",
    message: 'syntax error at or near "FROM"',
    operation: "execute_query",
    sqlstate: "42601",
  },
  {
    code: Code.AlreadyExists,
    conditionName: "unique_violation",
    kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_ALREADY_EXISTS,
    label: "Unique constraint violation",
    message: 'duplicate key value violates unique constraint "users_email_key"',
    operation: "create_user",
    sqlstate: "23505",
  },
] satisfies readonly PostgresErrorExample[];

function createPostgresError(example: PostgresErrorExample) {
  const error = new ConnectError(
    `PostgreSQL ${example.sqlstate}: ${example.message}`,
    example.code
  );

  error.details = [
    {
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        create(PostgreSqlErrorDetailSchema, {
          conditionName: example.conditionName,
          kind: example.kind,
          operation: example.operation,
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          serverFields: { message: example.message },
          sqlstate: example.sqlstate,
          sqlstateClass: example.sqlstate.slice(0, 2),
        })
      ),
    },
  ];

  return normalizeAppUiError(error, {
    source: "connect",
    surface: "inline",
  });
}

test("common PostgreSQL errors keep concise guidance on the main surface", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1100px] space-y-5 rounded-2xl border border-border bg-background p-6 text-foreground">
        <header className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {"Common PostgreSQL errors"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {
              "The summary and recommendation stay visible. SQLSTATE and the PostgreSQL server message are available in Error details."
            }
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4">
          {POSTGRES_ERROR_EXAMPLES.map((example) => (
            <section
              className="space-y-2 rounded-xl border border-border bg-muted/20 p-4"
              key={example.sqlstate}
            >
              <h2 className="font-medium text-sm">{example.label}</h2>
              <AppErrorView error={createPostgresError(example)} />
            </section>
          ))}
        </div>
      </div>
    </ScreenshotFrame>
  );

  await Promise.all(
    POSTGRES_ERROR_EXAMPLES.map((example) =>
      expect
        .element(
          page.getByText(
            `PostgreSQL ${example.conditionName} during ${example.operation}`
          )
        )
        .toBeVisible()
    )
  );
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "postgres-error-summaries"
  );
});

test("PostgreSQL error details expose diagnostics and support actions", async () => {
  const permissionError = POSTGRES_ERROR_EXAMPLES.find(
    (example) => example.sqlstate === "42501"
  );
  if (!permissionError) {
    throw new Error("Expected a permission error visual fixture.");
  }

  render(
    <ScreenshotFrame>
      <div className="w-[720px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <AppErrorView
          error={createPostgresError(permissionError)}
          onRetry={async () => undefined}
          retryLabel="Retry query"
        />
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Error details" }).click();

  const dialog = page.getByRole("dialog", {
    name: "PostgreSQL permission denied",
  });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(page.getByText("SQLSTATE: 42501", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      page.getByText("Condition: insufficient_privilege", { exact: true })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy details" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Copy as cURL" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Download" }))
    .not.toBeInTheDocument();
  await expect(dialog).toMatchScreenshot("postgres-error-details");
});
