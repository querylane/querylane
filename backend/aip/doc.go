// Package aip provides AIP-132/AIP-158 compliant paginated list queries
// with cursor-based keyset pagination, field ordering, and server-side
// filtering (a curated AIP-160 subset).
//
// The package is backend-neutral: a Schema declares the API-level fields of a
// resource (codecs, ordering defaults, filterability) and BuildPlan validates
// a request's page_size/page_token/order_by/filter into a Plan. Executing the
// plan against a database is the job of a backend subpackage:
//
//   - aip/jet — go-jet query builder (the meta database in storage/)
//   - aip/rawsql — handwritten SQL (live user instances in engine/postgres/)
//
// Each backend binds database columns/expressions to the schema's field paths
// at construction time via Bind, which panics on any orderable or filterable
// field left unbound (same pattern as regexp.MustCompile).
//
// Usage (go-jet):
//
//	var mySchema = aipjet.Bind(
//	    aip.NewSchema[model.MyResource](
//	        "example.com/MyResource",
//	        aip.Fields[model.MyResource]{
//	            "display_name": {Codec: aip.StringCodec{}, GetValue: func(m *model.MyResource) any { return m.DisplayName }},
//	            "id":           {Codec: aip.StringCodec{}, GetValue: func(m *model.MyResource) any { return m.ID }},
//	        },
//	        aip.WithDefaultOrder("display_name", aip.Asc),
//	        aip.WithTieBreaker("id", aip.Asc),
//	    ),
//	    aipjet.Columns{
//	        "display_name": table.MyResource.DisplayName,
//	        "id":           table.MyResource.ID,
//	    },
//	)
//
//	rows, nextToken, err := aipjet.Execute(ctx, mySchema,
//	    aip.Params{PageSize: pageSize, PageToken: pageToken, Filter: filter, OrderBy: orderBy},
//	    baseQuery, db)
//
// Callers that paginate in memory (no database) use BuildPlan and
// Schema.NextPageToken directly on an unbound schema.
package aip
