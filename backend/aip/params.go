package aip

// Params captures the standard AIP-158/AIP-132 list request fields.
// Typically populated directly from the gRPC request message:
//
//	params := aip.Params{
//	    PageSize:  req.Msg.GetPageSize(),
//	    PageToken: req.Msg.GetPageToken(),
//	    Filter:    req.Msg.GetFilter(),
//	    OrderBy:   req.Msg.GetOrderBy(),
//	}
type Params struct {
	PageSize  int32
	PageToken string
	Filter    string // Passed through opaquely; only hashed for token consistency checks.
	OrderBy   string // AIP-132 syntax: "field_name [asc|desc], ..."
}
