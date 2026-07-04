package types

import (
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// EngineConfigJSON is an alias type used in the go-jet model.
type EngineConfigJSON = ProtoJSON[*api.PostgresConfig]
