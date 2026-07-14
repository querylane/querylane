//go:build !querylane_dev

package server

import "net/http"

const grpcReflectionEnabled = false

func registerGRPCReflection(_ *http.ServeMux) {}
