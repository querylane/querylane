import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

function observationAvailabilityLabel(availability: ObservationAvailability) {
  switch (availability) {
    case ObservationAvailability.AVAILABLE:
      return "Available";
    case ObservationAvailability.UNSUPPORTED:
      return "Not supported by this server";
    case ObservationAvailability.RESTRICTED:
      return "Restricted";
    case ObservationAvailability.UNAVAILABLE:
      return "Unavailable";
    case ObservationAvailability.NOT_APPLICABLE:
      return "Not applicable";
    case ObservationAvailability.UNSPECIFIED:
      return "Not reported";
    default:
      return "Not reported";
  }
}

export { observationAvailabilityLabel };
