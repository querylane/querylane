package pgconv

import api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"

// ObservationAvailabilityToProto preserves unsupported/restricted/failed
// observations separately from an actual measured zero.
func ObservationAvailabilityToProto(availability string) api.ObservationAvailability {
	switch availability {
	case "available":
		return api.ObservationAvailability_OBSERVATION_AVAILABILITY_AVAILABLE
	case "unsupported":
		return api.ObservationAvailability_OBSERVATION_AVAILABILITY_UNSUPPORTED
	case "restricted":
		return api.ObservationAvailability_OBSERVATION_AVAILABILITY_RESTRICTED
	case "not_applicable":
		return api.ObservationAvailability_OBSERVATION_AVAILABILITY_NOT_APPLICABLE
	default:
		return api.ObservationAvailability_OBSERVATION_AVAILABILITY_UNAVAILABLE
	}
}
