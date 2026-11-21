import {
  type ChangeSource,
  createChange,
  definePrimitive,
  type Primitive,
  sourceOf,
} from "@ui-sdk/core";
import { withSource } from "@ui-sdk/core/observe";
import type { PrimitiveHandle } from "@ui-sdk/react/primitive";
import { mergeProps, usePart, usePrimitive } from "@ui-sdk/react/primitive";
import {
  createContext,
  createElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import {
  baseUiState,
  nextUiFrame,
  requireBaseUiTarget,
  setBaseUiChecked,
  setBaseUiOpen,
  setBaseUiValue,
} from "./base-ui-dom";
import { BaseUiSafetyBoundary } from "./base-ui-safety";
import {
  baseUiModal,
  useBaseUiAnchor,
  useBaseUiModal,
  useBaseUiSafety,
} from "./base-ui-safety-context";

interface AdapterState {
  available: boolean;
  checked?: boolean | "mixed";
  disabled: boolean;
  error: string | null;
  open?: boolean;
  pending: boolean;
  required: boolean;
  value?: unknown;
}
const hasValue = (name: string) =>
  ["input", "select", "combobox"].includes(name);
const hasChecked = (name: string) =>
  ["checkbox", "switch", "radio"].includes(name);
const hasOpen = (name: string) =>
  ["select", "combobox", "popup"].includes(name);

function adapterAvailable(
  name: string,
  element: HTMLElement,
  available: boolean
) {
  return (
    available && !(name === "button" && element.hasAttribute("aria-haspopup"))
  );
}

function reflectionSource(
  pending: boolean,
  source: ChangeSource
): ChangeSource {
  return pending ? "agent" : source;
}

function actionError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The app refused this action.";
}

function adapter(name: string, actions: string[], closed = false) {
  const options = {};
  return Object.assign(
    definePrimitive({
      name: `base-${name}`,
      options,
      state: (): AdapterState => ({
        pending: false,
        error: null,
        disabled: false,
        required: false,
        available: true,
        ...(hasValue(name) ? { value: undefined } : {}),
        ...(hasChecked(name) ? { checked: false } : {}),
        ...(hasOpen(name) ? { open: false } : {}),
      }),
      api: (context) => {
        const change = createChange(context);
        function refresh(
          element: HTMLElement,
          source: ChangeSource = sourceOf()
        ) {
          const next = baseUiState(element);
          const provenance = reflectionSource(
            context.store.get().pending,
            source
          );
          if (hasValue(name)) {
            change("value", next.value, {
              reason: "input-change",
              source: provenance,
            });
          }
          if (hasChecked(name)) {
            change("checked", next.checked, {
              reason: "input-change",
              source: provenance,
            });
          }
          if (hasOpen(name)) {
            change("open", next.open, {
              reason: "input-change",
              source: provenance,
            });
          }
          context.store.set({
            disabled: next.disabled,
            required: next.required,
            available: adapterAvailable(name, element, next.available),
          });
        }
        async function run(
          action: (
            element: HTMLElement,
            guard: () => void
          ) => void | Promise<void>
        ) {
          const element = requireBaseUiTarget(context.element("root"));
          const { location } = element.ownerDocument;
          const { href } = location;
          const { enabled } = useAgentAccessStore.getState();
          function guard() {
            requireBaseUiTarget(element);
            if (
              element.ownerDocument.location.href !== href ||
              (enabled && !useAgentAccessStore.getState().enabled)
            ) {
              throw new Error("The agent control session ended.");
            }
          }
          context.store.set({ pending: true, error: null });
          try {
            await withSource("agent", () => action(element, guard));
            await nextUiFrame();
            if (element.isConnected) {
              refresh(element, "agent");
            }
          } catch (error) {
            context.store.set({
              error: actionError(error),
            });
          } finally {
            context.store.set({ pending: false });
          }
        }
        return {
          refresh,
          ...(hasValue(name)
            ? {
                setValue: (value: unknown) =>
                  run((element, guard) =>
                    setBaseUiValue(element, value, guard)
                  ),
              }
            : {}),
          ...(hasChecked(name)
            ? {
                setChecked: (checked: unknown) =>
                  run((element) => setBaseUiChecked(element, checked)),
              }
            : {}),
          ...(hasOpen(name)
            ? {
                setOpen: (open: unknown) =>
                  run(async (element) => {
                    setBaseUiOpen(element, open);
                    await nextUiFrame();
                    if (baseUiState(element).open !== open) {
                      throw new Error(
                        "The app refused the requested popup state."
                      );
                    }
                  }),
              }
            : {}),
          press: () =>
            run((element) => {
              element.click();
            }),
          focus: () =>
            run((element) => {
              element.focus();
            }),
        };
      },
      slots: (slot) => ({
        item: slot<{ value: string }>({ props: { value: "string" } }),
        root: slot({
          bind(element, part) {
            part.api.refresh(element);
            const update = () => {
              part.api.refresh(element);
            };
            const observer = new MutationObserver(update);
            observer.observe(element, {
              attributes: true,
              childList: true,
              subtree: true,
            });
            element.addEventListener("input", update);
            element.addEventListener("change", update);
            return () => {
              observer.disconnect();
              element.removeEventListener("input", update);
              element.removeEventListener("change", update);
            };
          },
        }),
      }),
      agent: {
        actions,
        closed,
        shown: (state) => state.available,
      },
    }),
    { options }
  );
}

type AdapterKind =
  | "button"
  | "input"
  | "checkbox"
  | "switch"
  | "select"
  | "combobox"
  | "popup"
  | "tab"
  | "radio";
const adapters: Record<AdapterKind, Primitive> = {
  button: adapter("button", ["press", "focus"]),
  input: adapter("input", ["setValue", "focus"]),
  checkbox: adapter("checkbox", ["setChecked", "focus"]),
  switch: adapter("switch", ["setChecked", "focus"]),
  select: adapter("select", ["setValue", "setOpen", "focus"], true),
  combobox: adapter("combobox", ["setValue", "setOpen", "focus"], true),
  popup: adapter("popup", ["setOpen", "focus"]),
  radio: adapter("radio", ["press", "focus"]),
  tab: adapter("tab", ["press", "focus"]),
};

function BaseUiAgent({
  kind,
  children,
}: {
  kind: AdapterKind;
  children: ReactElement<Record<string, unknown>>;
}) {
  const safety = useBaseUiSafety(children.props);
  const anchor = useBaseUiAnchor();
  const modal = useBaseUiModal();
  const slot = children.props["data-querylane-slot"];
  const popup =
    kind === "popup" && typeof slot === "string" && slot.endsWith("-content");
  const handle = usePrimitive(adapters[kind], {});
  const markup = {
    ref: kind === "popup" ? anchor : undefined,
    ...safety,
    "data-querylane-modal": popup && modal ? "" : undefined,
    render: (props: Record<string, unknown>) =>
      createElement(children.type, {
        ...mergeProps(props, children.props),
        ...safety,
      }),
  };
  return usePart(handle, "root", {}, markup);
}

const ChoiceScopeContext = createContext<PrimitiveHandle<Primitive> | null>(
  null
);
function BaseUiChoices({
  kind,
  markers,
  children,
}: {
  kind: "select" | "combobox";
  markers: unknown;
  children: ReactNode;
}) {
  const handle = usePrimitive(adapters[kind], {});
  return (
    <ChoiceScopeContext value={handle}>
      <BaseUiSafetyBoundary
        markers={markers}
        modal={baseUiModal(markers, kind === "select")}
      >
        {children}
      </BaseUiSafetyBoundary>
    </ChoiceScopeContext>
  );
}
function useChoiceHandle() {
  const handle = useContext(ChoiceScopeContext);
  if (!handle) {
    throw new Error("A Base UI choice part needs its root adapter.");
  }
  return handle;
}
function BaseUiChoiceTrigger({
  children,
}: {
  children: ReactElement<Record<string, unknown>>;
}) {
  const handle = useChoiceHandle();
  const anchor = useBaseUiAnchor();
  const safety = useBaseUiSafety(children.props);
  return usePart(
    handle,
    "root",
    {},
    {
      ...safety,
      ref: anchor,
      render: (props: Record<string, unknown>) =>
        createElement(children.type, {
          ...mergeProps(props, children.props),
          ...safety,
        }),
    }
  );
}
function BaseUiChoiceItem({
  value,
  children,
}: {
  value: unknown;
  children: ReactElement<Record<string, unknown>>;
}) {
  const handle = useChoiceHandle();
  const safety = useBaseUiSafety(children.props);
  const key = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return usePart(
    handle,
    "item",
    { value: key },
    {
      ...safety,
      render: (props: Record<string, unknown>) =>
        createElement(children.type, {
          ...mergeProps(props, children.props),
          ...safety,
        }),
    }
  );
}

export { BaseUiAgent, BaseUiChoiceItem, BaseUiChoices, BaseUiChoiceTrigger };
