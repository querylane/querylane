package onboarding

import (
	"github.com/querylane/querylane/backend/dbsetup"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// progressEventToProto converts an internal ProgressEvent to its protobuf
// representation.
func progressEventToProto(e dbsetup.ProgressEvent) *v1alpha1.SetupProgressEvent {
	return &v1alpha1.SetupProgressEvent{
		StepId:      stepIDToProto(e.StepID),
		DisplayName: e.DisplayName,
		State:       stepStateToProto(e.State),
		Error:       e.Error,
	}
}

func stepIDToProto(id dbsetup.StepID) v1alpha1.SetupStep {
	switch id {
	case dbsetup.StepStartingEmbedded:
		return v1alpha1.SetupStep_SETUP_STEP_STARTING_EMBEDDED
	case dbsetup.StepConnecting:
		return v1alpha1.SetupStep_SETUP_STEP_CONNECTING
	case dbsetup.StepMigrating:
		return v1alpha1.SetupStep_SETUP_STEP_MIGRATING
	case dbsetup.StepInitializingServices:
		return v1alpha1.SetupStep_SETUP_STEP_INITIALIZING_SERVICES
	case dbsetup.StepPersistingConfig:
		return v1alpha1.SetupStep_SETUP_STEP_PERSISTING_CONFIG
	case dbsetup.StepWaitingForConfig:
		return v1alpha1.SetupStep_SETUP_STEP_WAITING_FOR_CONFIG
	case dbsetup.StepConfigDetected:
		return v1alpha1.SetupStep_SETUP_STEP_CONFIG_DETECTED
	default:
		return v1alpha1.SetupStep_SETUP_STEP_UNSPECIFIED
	}
}

func stepStateToProto(s dbsetup.StepState) v1alpha1.StepState {
	switch s {
	case dbsetup.StatePending:
		return v1alpha1.StepState_STEP_STATE_PENDING
	case dbsetup.StateInProgress:
		return v1alpha1.StepState_STEP_STATE_IN_PROGRESS
	case dbsetup.StateSucceeded:
		return v1alpha1.StepState_STEP_STATE_SUCCEEDED
	case dbsetup.StateFailed:
		return v1alpha1.StepState_STEP_STATE_FAILED
	default:
		return v1alpha1.StepState_STEP_STATE_UNSPECIFIED
	}
}

// wrapSetupEvent wraps a SetupProgressEvent in a SetupAppDatabaseResponse.
func wrapSetupEvent(e *v1alpha1.SetupProgressEvent) *v1alpha1.SetupAppDatabaseResponse {
	return &v1alpha1.SetupAppDatabaseResponse{Event: e}
}

// wrapWatchEvent wraps a SetupProgressEvent in a WatchConfigChangesResponse.
func wrapWatchEvent(e *v1alpha1.SetupProgressEvent) *v1alpha1.WatchConfigChangesResponse {
	return &v1alpha1.WatchConfigChangesResponse{Event: e}
}
