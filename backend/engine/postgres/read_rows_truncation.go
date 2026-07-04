package postgres

import (
	"fmt"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// applyEmergencyTruncation re-truncates a row's preview-eligible cells to
// emergencyCellBytes so the row fits inside the response budget. Returns
// true if any cell was modified. Cells that were not previously truncated
// gain a freshly-minted full_value_token so the client can still expand
// them later; if minting fails the error is returned and the caller must
// fail the page rather than emit a permanently-broken cell.
func applyEmergencyTruncation(d *Postgres, row *api.TableResultRow, publicCols []engine.Column, identity *api.RowIdentity, identityValues []*api.TableValue, resourceName string) (bool, error) {
	changed := false

	for i, cell := range row.GetValues() {
		if i >= len(publicCols) {
			break
		}

		col := publicCols[i]
		if !previewEligible(col) {
			continue
		}

		v := cell.GetValue()

		// For each preview-eligible kind: capture the original byte length
		// before slicing so we can preserve full_size_bytes when it wasn't
		// already set by the preview pass. String/json use a UTF-8-safe
		// trim so the prefix stays valid; bytea slices on the byte
		// boundary, which is the right behavior for binary.
		switch k := v.GetKind().(type) {
		case *api.TableValue_StringValue:
			full := len(k.StringValue)
			if full > emergencyCellBytes {
				k.StringValue = trimUTF8(k.StringValue, emergencyCellBytes)

				if !cell.Truncated {
					cell.FullSizeBytes = int64(full)
				}

				cell.Truncated = true
				changed = true
			}
		case *api.TableValue_BytesValue:
			full := len(k.BytesValue)
			if full > emergencyCellBytes {
				k.BytesValue = k.BytesValue[:emergencyCellBytes]

				if !cell.Truncated {
					cell.FullSizeBytes = int64(full)
				}

				cell.Truncated = true
				changed = true
			}
		case *api.TableValue_JsonValue:
			full := len(k.JsonValue)
			if full > emergencyCellBytes {
				k.JsonValue = trimUTF8(k.JsonValue, emergencyCellBytes)

				if !cell.Truncated {
					cell.FullSizeBytes = int64(full)
				}

				cell.Truncated = true
				changed = true
			}
		}

		if cell.GetTruncated() && cell.GetFullValueToken() == "" {
			tok, err := d.mintFullValueToken(resourceName, col.Name, identity, identityValues)
			if err != nil {
				return changed, fmt.Errorf("mint full_value_token for column %q: %w", col.Name, err)
			}

			cell.FullValueToken = tok
		}
	}

	return changed, nil
}

// cellByteLength returns the byte length of the scanned value as it would
// appear over the wire. Used to decide whether a PREVIEW-eligible cell
// was truncated vs. came back whole.
func cellByteLength(v *api.TableValue) int {
	switch k := v.GetKind().(type) {
	case *api.TableValue_StringValue:
		return len(k.StringValue)
	case *api.TableValue_BytesValue:
		return len(k.BytesValue)
	case *api.TableValue_JsonValue:
		return len(k.JsonValue)
	case *api.TableValue_NumericValue:
		return len(k.NumericValue)
	case *api.TableValue_TimestampValue:
		return len(k.TimestampValue)
	}

	return 0
}
