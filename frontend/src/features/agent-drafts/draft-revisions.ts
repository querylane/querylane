import {
  type ChangeDetails,
  createChange,
  createRovingFocus,
  definePrimitive,
  type PropSchema,
} from "@ui-sdk/core";

interface DraftRevisionsOptions {
  defaultValue?: string;
  first?: string;
  onValueChange?: (
    value: string,
    details: ChangeDetails<"item-press" | "list-navigation" | "imperative">
  ) => void;
  value?: string;
}
interface DraftRevisionsState {
  focused: string | null;
  value: string;
}

const optionsSchema = {
  value: "string",
  defaultValue: "string",
  first: "string",
  onValueChange: "callback",
} satisfies PropSchema<DraftRevisionsOptions>;

const draftRevisions = Object.assign(
  definePrimitive({
    name: "draft-revisions",
    options: optionsSchema,
    state: (options: DraftRevisionsOptions): DraftRevisionsState => ({
      value: options.value ?? options.defaultValue ?? options.first ?? "0",
      focused: null,
    }),
    sync: (options) =>
      options.value === undefined ? {} : { value: options.value },
    api: (context) => {
      const change = createChange(context);
      const roving = createRovingFocus(context, {
        slot: "revision",
        key: "focused",
        remember: false,
        preferred: (item) => item.key === context.store.get().value,
        claims: (state, item) => item.key === state.value,
        orientation: () => "both",
        loop: () => true,
      });
      return {
        roving,
        setValue(value: unknown) {
          if (
            typeof value !== "string" ||
            roving.items().every((item) => item.key !== value)
          ) {
            throw new Error("Choose an available draft revision.");
          }
          return change("value", value, { reason: "imperative" });
        },
        choose(value: string, event?: Event) {
          return change("value", value, {
            reason: "item-press",
            ...(event ? { event } : {}),
          });
        },
        keydown(event: KeyboardEvent, el: HTMLElement) {
          const moved = roving.keydown(event, el);
          if (moved) {
            change("value", moved.key, { reason: "list-navigation", event });
          }
        },
      };
    },
    slots: (slot) => ({
      root: slot({
        role: "radiogroup",
        keys: { none: "Each revision handles its own arrow keys." },
        attrs: () => ({ "aria-orientation": "horizontal" }),
      }),
      revision: slot<{ value: string }>({
        props: { value: "string" },
        role: "radio",
        focus: "roving",
        keys: [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
        ],
        attrs: (state, part) => ({
          type: "button",
          "aria-checked": String(part.key === state.value),
          tabindex: part.api.roving.tabIndex(state, part),
          "data-value": part.key,
        }),
        press: ({ api, key }, event) => api.choose(key, event),
        on: {
          keydown: (event, { el, api }) => {
            if (el) {
              api.keydown(event, el);
            }
          },
        },
        bind: (el, part) => part.api.roving.bind(el, part),
      }),
    }),
    agent: { actions: ["setValue"], closed: true },
  }),
  { options: optionsSchema }
);

export { draftRevisions };
