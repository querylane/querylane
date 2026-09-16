import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Item as BaseItem,
  ItemActions as BaseItemActions,
  ItemContent as BaseItemContent,
  ItemDescription as BaseItemDescription,
  ItemFooter as BaseItemFooter,
  ItemGroup as BaseItemGroup,
  ItemHeader as BaseItemHeader,
  ItemMedia as BaseItemMedia,
  ItemSeparator as BaseItemSeparator,
  ItemTitle as BaseItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";

const itemPresentations = cva("", {
  variants: {
    presentation: {
      interactive: "hover:bg-muted/50",
    },
  },
});

function Item({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseItem> & VariantProps<typeof itemPresentations>) {
  return (
    <BaseItem
      className={cn(itemPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const itemTitlePresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono",
    },
  },
});

function ItemTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseItemTitle> &
  VariantProps<typeof itemTitlePresentations>) {
  return (
    <BaseItemTitle
      className={cn(itemTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

function ItemActions(props: ComponentProps<typeof BaseItemActions>) {
  return <BaseItemActions {...props} />;
}
function ItemContent(props: ComponentProps<typeof BaseItemContent>) {
  return <BaseItemContent {...props} />;
}
function ItemDescription(props: ComponentProps<typeof BaseItemDescription>) {
  return <BaseItemDescription {...props} />;
}
function ItemFooter(props: ComponentProps<typeof BaseItemFooter>) {
  return <BaseItemFooter {...props} />;
}
function ItemGroup(props: ComponentProps<typeof BaseItemGroup>) {
  return <BaseItemGroup {...props} />;
}
function ItemHeader(props: ComponentProps<typeof BaseItemHeader>) {
  return <BaseItemHeader {...props} />;
}
function ItemMedia(props: ComponentProps<typeof BaseItemMedia>) {
  return <BaseItemMedia {...props} />;
}
function ItemSeparator(props: ComponentProps<typeof BaseItemSeparator>) {
  return <BaseItemSeparator {...props} />;
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
};
