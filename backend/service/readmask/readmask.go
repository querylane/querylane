// Package readmask validates resource-relative read masks and projects fresh response messages.
package readmask

import (
	"errors"
	"strings"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

// Projection selects resource fields without affecting collection metadata or pagination.
type Projection struct{ paths []string }

// New validates against a resource before any catalog work. Empty masks preserve legacy full responses.
func New(mask *fieldmaskpb.FieldMask, resource proto.Message) (Projection, error) {
	paths := mask.GetPaths()
	if len(paths) == 0 || (len(paths) == 1 && paths[0] == "*") {
		return Projection{}, nil
	}
	if !mask.IsValid(resource) {
		return Projection{}, connect.NewError(connect.CodeInvalidArgument, errors.New("read_mask contains an invalid resource field path"))
	}
	normalized := &fieldmaskpb.FieldMask{Paths: append([]string(nil), paths...)}
	normalized.Normalize()
	return Projection{paths: normalized.Paths}, nil
}

// Apply mutates only a freshly converted response resource, never a cached catalog value.
func (p Projection) Apply(resource proto.Message) {
	if len(p.paths) == 0 {
		return
	}
	project(resource.ProtoReflect(), p.paths)
}

func project(message protoreflect.Message, paths []string) {
	message.Range(func(field protoreflect.FieldDescriptor, _ protoreflect.Value) bool {
		name := string(field.Name())
		var nested []string
		for _, path := range paths {
			if path == name {
				return true
			}
			if suffix, ok := strings.CutPrefix(path, name+"."); ok {
				nested = append(nested, suffix)
			}
		}
		if len(nested) == 0 {
			message.Clear(field)
		} else {
			project(message.Mutable(field).Message(), nested)
		}
		return true
	})
}
