import { SelectItem } from "@/components/querylane-ui/select";
import {
  SelectItemDescription,
  SelectValue,
} from "@/components/select-extensions";
import {
  getSslNegotiationOption,
  SSL_NEGOTIATION_OPTIONS,
} from "@/lib/ssl-modes";

function SslNegotiationSelectValue({
  placeholder = "Select SSL negotiation",
  value,
}: {
  placeholder?: string | undefined;
  value: string | undefined;
}) {
  const option = getSslNegotiationOption(value);
  return (
    <SelectValue placeholder={placeholder}>
      {option?.value ?? placeholder}
    </SelectValue>
  );
}

function SslNegotiationSelectItems() {
  return SSL_NEGOTIATION_OPTIONS.map((option) => (
    <SelectItem key={option.value} label={option.value} value={option.value}>
      <span className="min-w-0">
        <span className="block font-medium">{option.value}</span>
        <SelectItemDescription>{option.description}</SelectItemDescription>
      </span>
    </SelectItem>
  ));
}

export { SslNegotiationSelectItems, SslNegotiationSelectValue };
