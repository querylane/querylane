package resource

import (
	"fmt"
	"strings"
)

const maxResourceIDLength = 256

// Resource IDs derived from raw PostgreSQL identifiers (database, schema,
// table, and view names) must fit into a single resource-name path segment.
// Only the two characters that would corrupt a segment are escaped: "/" (the
// segment separator) and "%" (the escape character itself). Every other
// character passes through unchanged, so common identifiers keep their
// existing wire representation.
var (
	idSegmentEscaper   = strings.NewReplacer("%", "%25", "/", "%2F")
	idSegmentUnescaper = strings.NewReplacer("%2F", "/", "%25", "%")
)

// encodeIDSegment returns the wire-safe single-segment form of a raw
// PostgreSQL identifier. Identifiers without "/" or "%" are returned
// unchanged.
func encodeIDSegment(id string) string {
	if !strings.ContainsAny(id, "/%") {
		return id
	}

	return idSegmentEscaper.Replace(id)
}

// decodeIDSegment reverses encodeIDSegment. It only decodes the escape
// sequences encodeIDSegment can produce ("%2F" and "%25"); any other "%" is
// left untouched so pre-existing names containing a literal "%" keep parsing
// to the same identifier.
func decodeIDSegment(segment string) string {
	if !strings.Contains(segment, "%") {
		return segment
	}

	return idSegmentUnescaper.Replace(segment)
}

// validateResourceID checks that a resource ID does not contain control
// characters and does not exceed the maximum allowed length.
func validateResourceID(id string) error {
	if len(id) > maxResourceIDLength {
		return fmt.Errorf("resource ID exceeds max length of %d characters (got %d)", maxResourceIDLength, len(id))
	}

	for i := range len(id) {
		b := id[i]
		if b <= 31 || b == 127 {
			return fmt.Errorf("resource ID contains control character at byte %d (0x%02x)", i, b)
		}
	}

	return nil
}

// isVariable reports whether a template segment is a variable placeholder
// (e.g., "{instanceID}").
func isVariable(segment string) bool {
	return len(segment) > 2 && segment[0] == '{' && segment[len(segment)-1] == '}'
}

// parse is the internal helper that handles all validation logic.
func parse(name string, template []string) (map[string]string, error) {
	parts := strings.Split(name, "/")
	if len(parts) != len(template) {
		return nil, &ParseError{
			Name:     name,
			Segment:  -1, // Special value indicating segment count mismatch
			Expected: fmt.Sprintf("%d segments", len(template)),
			Got:      fmt.Sprintf("%d segments", len(parts)),
		}
	}

	vars := make(map[string]string, len(template)/2)
	for i, segmentTmpl := range template {
		// Check if the template segment is a variable (e.g., "{instanceID}")
		if isVariable(segmentTmpl) {
			varName := segmentTmpl[1 : len(segmentTmpl)-1]
			if parts[i] == "" {
				return nil, &ParseError{
					Name:     name,
					Segment:  i + 1,
					Expected: "non-empty " + varName,
					Got:      "empty segment",
				}
			}

			if err := validateResourceID(parts[i]); err != nil {
				return nil, &ParseError{
					Name:     name,
					Segment:  i + 1,
					Expected: "valid " + varName,
					Got:      err.Error(),
				}
			}

			vars[varName] = parts[i]
		} else if parts[i] != segmentTmpl {
			// Literal collection name mismatch (e.g., "workspaces")
			return nil, &ParseError{
				Name:     name,
				Segment:  i + 1,
				Expected: segmentTmpl,
				Got:      parts[i],
			}
		}
	}

	return vars, nil
}
