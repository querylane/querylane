//go:build querylane_dev

package server

import (
	"net/http"

	"connectrpc.com/grpcreflect"

	v1alpha1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

const grpcReflectionEnabled = true

func registerGRPCReflection(mux *http.ServeMux) {
	reflector := grpcreflect.NewStaticReflector(
		v1alpha1connect.OnboardingServiceName,
		v1alpha1connect.ConsoleServiceName,
		v1alpha1connect.InstanceServiceName,
		v1alpha1connect.DatabaseServiceName,
		v1alpha1connect.RoleServiceName,
		v1alpha1connect.SchemaServiceName,
		v1alpha1connect.ExtensionServiceName,
		v1alpha1connect.TableServiceName,
		v1alpha1connect.ViewServiceName,
		v1alpha1connect.TableDataServiceName,
		v1alpha1connect.SQLServiceName,
	)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))
}
