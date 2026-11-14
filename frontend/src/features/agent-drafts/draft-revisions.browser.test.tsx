import { expect, test } from "@rstest/core";
import { getByRole } from "@testing-library/dom";
import { checkDirection, checkPattern } from "@ui-sdk/core/testing";
import { render } from "@/__tests__/render-ui";
import {
  DraftRevision,
  DraftRevisions,
} from "@/components/querylane-ui/draft-revisions";
import { draftRevisions } from "./draft-revisions";

test("the composed revision picker passes its WAI-ARIA radio pattern", async () => {
  await render(
    <DraftRevisions aria-label="Draft revision" defaultValue="0">
      <DraftRevision value="0">Start</DraftRevision>
      <DraftRevision value="1">Agent edit</DraftRevision>
      <DraftRevision value="2">Human edit</DraftRevision>
    </DraftRevisions>
  );
  await expect(
    checkPattern(
      getByRole(document.body, "radiogroup", { name: "Draft revision" }),
      "radio-group"
    )
  ).resolves.toBeUndefined();
});

test("revision navigation mirrors in right-to-left layouts", async () => {
  await expect(
    checkDirection(
      draftRevisions,
      { defaultValue: "0" },
      '<root aria-label="Draft revision"><revision value="0">Start</revision><revision value="1">Agent edit</revision><revision value="2">Human edit</revision></root>'
    )
  ).resolves.toBeUndefined();
});
