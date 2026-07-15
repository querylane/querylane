package pgconv

import (
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// DatabaseStatusFromInitializer builds an AppDatabaseStatus from the primitive
// values returned by a DatabaseInitializer. It takes plain values instead of
// the interface so it stays decoupled and easy to test.
func DatabaseStatusFromInitializer(isInitialized bool, initError string) *v1alpha1.AppDatabaseStatus {
	status := &v1alpha1.AppDatabaseStatus{}

	switch {
	case isInitialized:
		status.State = v1alpha1.AppDatabaseStatus_STATE_READY
	case initError != "":
		status.State = v1alpha1.AppDatabaseStatus_STATE_ERROR
		status.Error = initError
	default:
		status.State = v1alpha1.AppDatabaseStatus_STATE_NOT_CONFIGURED
	}

	return status
}
