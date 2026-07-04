package rpctest

import (
	"context"
	"database/sql"
	"time"
	"unicode/utf8"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestReadRows_BasicRead() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.GreaterOrEqual(len(rs.GetRows()), 25, "should return at least 25 rows")

	colNames := make(map[string]bool)
	for _, col := range rs.GetColumns() {
		colNames[col.GetColumnName()] = true
	}

	s.True(colNames["id"], "should have id column")
	s.True(colNames["first_name"], "should have first_name column")
	s.True(colNames["email"], "should have email column")
}

func (s *RPCSuite) TestReadRows_RowIdentityPK() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: 1,
	}))
	s.Require().NoError(err)

	id := resp.Msg.GetResultSet().GetRowIdentity()
	s.Require().NotNil(id)
	s.Equal(consolev1alpha1.RowIdentity_SOURCE_PRIMARY_KEY, id.GetSource())
	s.Equal([]string{"id"}, id.GetColumnNames())
}

func (s *RPCSuite) TestReadRows_SelectedColumns() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id", "email"},
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.Len(rs.GetColumns(), 2, "should return exactly 2 columns")
}

func (s *RPCSuite) TestNonUTF8Content_RoundTripsAsUTF8() {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	traditionalChineseSample := "\u7e41\u9ad4\u4e2d\u6587\u8cc7\u6599"
	japaneseSample := "\u65e5\u672c\u8a9e\u306e\u8cc7\u6599"

	cases := []struct {
		name                  string
		database              string
		serverEncoding        string
		defaultClientEncoding string
		value                 string
	}{
		// Big5 and SJIS are PostgreSQL client encodings, not server database
		// encodings. Reproduce them with UTF8 databases that default new
		// sessions to those legacy client encodings.
		{
			name:                  "traditional-chinese-big5-client",
			database:              "encoding_client_big5",
			serverEncoding:        "UTF8",
			defaultClientEncoding: "BIG5",
			value:                 traditionalChineseSample,
		},
		{
			name:                  "japanese-shift-jis-client",
			database:              "encoding_client_sjis",
			serverEncoding:        "UTF8",
			defaultClientEncoding: "SJIS",
			value:                 japaneseSample,
		},
		{
			name:           "japanese-euc-jp-server",
			database:       "encoding_server_euc_jp",
			serverEncoding: "EUC_JP",
			value:          japaneseSample,
		},
		{
			name:           "korean-euc-kr-server",
			database:       "encoding_server_euc_kr",
			serverEncoding: "EUC_KR",
			value:          "한국어 자료",
		},
		{
			name:           "cyrillic-windows-1251-server",
			database:       "encoding_server_win1251",
			serverEncoding: "WIN1251",
			value:          "Привет мир",
		},
		// PostgreSQL cannot use Big5 as a database server encoding; EUC_TW
		// is the server-encoding coverage for Traditional Chinese databases.
		{
			name:           "traditional-chinese-euc-tw-server",
			database:       "encoding_server_euc_tw",
			serverEncoding: "EUC_TW",
			value:          traditionalChineseSample,
		},
	}

	for _, tc := range cases {
		s.Run(tc.name, func() {
			s.seedEncodedContentDatabase(ctx, tc.database, tc.serverEncoding, tc.defaultClientEncoding, tc.value)

			tableName := resource.NewTableName(s.instanceID, tc.database, "public", "encoding_samples").String()
			resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
				Name:            tableName,
				PageSize:        1,
				SelectedColumns: []string{"id", "note"},
			}))
			s.Require().NoError(err)

			rows := resp.Msg.GetResultSet().GetRows()
			s.Require().Len(rows, 1)

			got := rows[0].GetValues()[1].GetValue().GetStringValue()
			s.True(utf8.ValidString(got), "ReadRows must return valid UTF-8 for %s", tc.name)
			s.Equal(tc.value, got)

			previewResp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
				Name:            tableName,
				PageSize:        1,
				SelectedColumns: []string{"id", "note"},
				CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_PREVIEW,
				MaxCellBytes:    1,
			}))
			s.Require().NoError(err)

			previewRows := previewResp.Msg.GetResultSet().GetRows()
			s.Require().Len(previewRows, 1)

			previewCell := previewRows[0].GetValues()[1]
			s.True(previewCell.GetTruncated(), "preview must truncate %s sample", tc.name)
			s.NotEmpty(previewCell.GetFullValueToken())

			fullResp, err := s.tableDataClient.ReadCellValue(ctx, connect.NewRequest(&consolev1alpha1.ReadCellValueRequest{
				Name:           tableName,
				FullValueToken: previewCell.GetFullValueToken(),
			}))
			s.Require().NoError(err)

			fullGot := fullResp.Msg.GetValue().GetValue().GetStringValue()
			s.True(utf8.ValidString(fullGot), "ReadCellValue must return valid UTF-8 for %s", tc.name)
			s.Equal(tc.value, fullGot)

			sqlGot := s.readEncodingSampleViaSQL(ctx, tc.database)
			s.True(utf8.ValidString(sqlGot), "ExecuteQuery must return valid UTF-8 for %s", tc.name)
			s.Equal(tc.value, sqlGot)
		})
	}
}

func (s *RPCSuite) TestReadRows_Pagination() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	idAsc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: 5,
		OrderBy:  idAsc,
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.Len(rs.GetRows(), 5, "first page should have 5 rows")
	s.NotEmpty(resp.Msg.GetNextPageToken(), "should have next page token")

	// PK + NOT NULL order column => keyset.
	s.Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, rs.GetPaginationStrategy())

	resp2, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:      s.tableName("public", "customers"),
		PageSize:  5,
		OrderBy:   idAsc,
		PageToken: resp.Msg.GetNextPageToken(),
	}))
	s.Require().NoError(err)
	s.Len(resp2.Msg.GetResultSet().GetRows(), 5, "second page should have 5 rows")

	// Pages must be disjoint.
	page1IDs := map[int64]bool{}
	for _, row := range rs.GetRows() {
		page1IDs[row.GetValues()[0].GetValue().GetInt64Value()] = true
	}

	for _, row := range resp2.Msg.GetResultSet().GetRows() {
		id := row.GetValues()[0].GetValue().GetInt64Value()
		s.False(page1IDs[id], "row %d appears on both pages", id)
	}
}

func (s *RPCSuite) TestReadRows_KeysetTokenForDifferentTable() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	idAsc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: 5,
		OrderBy:  idAsc,
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(resp.Msg.GetNextPageToken())

	_, err = s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:      s.tableName("public", "products"),
		PageSize:  5,
		PageToken: resp.Msg.GetNextPageToken(),
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *RPCSuite) TestReadRows_KeysetTokenTampered() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	idAsc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: 5,
		OrderBy:  idAsc,
	}))
	s.Require().NoError(err)

	tok := resp.Msg.GetNextPageToken()
	s.Require().NotEmpty(tok)

	// Flip a byte mid-token.
	tampered := tok[:len(tok)/2] + "X" + tok[len(tok)/2+1:]

	_, err = s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:      s.tableName("public", "customers"),
		PageSize:  5,
		OrderBy:   idAsc,
		PageToken: tampered,
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *RPCSuite) TestReadRows_CellTruncation() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// products has a "description" text column that may be small in seed
	// data. Force PREVIEW with a tight cap so even a normal description
	// trips truncation, then exercise ReadCellValue to fetch the full
	// value back via the token.
	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		PageSize:        5,
		SelectedColumns: []string{"id", "description"},
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_PREVIEW,
		MaxCellBytes:    8,
	}))
	s.Require().NoError(err)

	rows := resp.Msg.GetResultSet().GetRows()
	s.Require().NotEmpty(rows)

	// Find a row whose description was truncated.
	var truncated *consolev1alpha1.TableCell

	for _, row := range rows {
		desc := row.GetValues()[1]
		if desc.GetTruncated() {
			truncated = desc
			break
		}
	}

	s.Require().NotNil(truncated, "expected at least one truncated description with max_cell_bytes=8")
	s.Greater(truncated.GetFullSizeBytes(), int64(8))
	s.NotEmpty(truncated.GetFullValueToken())

	// Round-trip the truncation token through ReadCellValue.
	full, err := s.tableDataClient.ReadCellValue(ctx, connect.NewRequest(&consolev1alpha1.ReadCellValueRequest{
		Name:           s.tableName("public", "products"),
		FullValueToken: truncated.GetFullValueToken(),
	}))
	s.Require().NoError(err)

	s.False(full.Msg.GetValue().GetTruncated(), "default max_bytes should be enough to return the full value")
	// Surface the actual on-disk size matches what the page advertised.
	s.Equal(truncated.GetFullSizeBytes(), full.Msg.GetValue().GetFullSizeBytes())
}

func (s *RPCSuite) TestReadRows_ResponseBudget_StopsEarly() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// page_size 50, budget 64 bytes. Even one full row of customers exceeds
	// 64 bytes, so we should get exactly one row plus a continuation token,
	// and effective_response_bytes <= 64 except for the single-huge-row mode
	// which still sets next_page_token.
	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:             s.tableName("public", "customers"),
		PageSize:         50,
		MaxResponseBytes: 64,
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.LessOrEqual(len(rs.GetRows()), 50, "should not exceed pageSize")
	s.NotEmpty(resp.Msg.GetNextPageToken(), "budget cutoff should set next_page_token")

	limits := resp.Msg.GetLimits()
	s.NotNil(limits)
	s.Positive(limits.GetEffectiveResponseBytes(), "effective_response_bytes should be reported")
}

func (s *RPCSuite) TestStreamRows_MetadataBatchesStatsAndOrderParity() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	idDesc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_DESC},
	}

	reference, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		PageSize:        3,
		SelectedColumns: []string{"id", "email"},
		OrderBy:         idDesc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_FULL,
	}))
	s.Require().NoError(err)
	s.Require().Len(reference.Msg.GetResultSet().GetRows(), 3)

	stream, err := s.tableDataClient.StreamRows(ctx, connect.NewRequest(&consolev1alpha1.StreamRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id", "email"},
		OrderBy:         idDesc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_FULL,
		MaxRows:         3,
		BatchSize:       2,
	}))
	s.Require().NoError(err)

	metadata, batches, stats := s.collectStreamRows(stream)

	s.Require().NotNil(metadata, "stream should emit metadata first")
	s.Require().NotNil(stats, "stream should emit stats last")
	s.Equal([]string{"id", "email"}, streamColumnNames(metadata.GetColumns()))
	s.NotNil(metadata.GetRowIdentity())
	s.NotNil(metadata.GetObservedAt())
	s.Len(batches, 2, "batch_size=2 should split three rows into two batches")
	s.Len(batches[0].GetRows(), 2)
	s.Len(batches[1].GetRows(), 1)
	s.Equal(int64(3), stats.GetRowCount())
	s.True(stats.GetTruncated(), "max_rows should mark the stream truncated when more rows exist")
	s.NotNil(stats.GetLatency())

	streamedRows := make([]*consolev1alpha1.TableResultRow, 0, stats.GetRowCount())
	for _, batch := range batches {
		streamedRows = append(streamedRows, batch.GetRows()...)
	}

	for i, row := range streamedRows {
		wantID := reference.Msg.GetResultSet().GetRows()[i].GetValues()[0].GetValue().GetInt64Value()
		gotID := row.GetValues()[0].GetValue().GetInt64Value()
		s.Equalf(wantID, gotID, "stream row %d should match ReadRows ordering", i)
	}
}

func (s *RPCSuite) TestStreamRows_FilterParityAndByteCap() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := &consolev1alpha1.RowFilter{
		Node: &consolev1alpha1.RowFilter_Predicate{
			Predicate: &consolev1alpha1.RowPredicate{
				Column:   "is_active",
				Operator: consolev1alpha1.RowPredicate_OPERATOR_EQUAL,
				Values: []*consolev1alpha1.TableValue{
					{Kind: &consolev1alpha1.TableValue_BoolValue{BoolValue: false}},
				},
			},
		},
	}
	idAsc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	reference, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		PageSize:        5,
		SelectedColumns: []string{"id"},
		OrderBy:         idAsc,
		Filter:          filter,
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(reference.Msg.GetResultSet().GetRows())

	stream, err := s.tableDataClient.StreamRows(ctx, connect.NewRequest(&consolev1alpha1.StreamRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id"},
		OrderBy:         idAsc,
		Filter:          filter,
		MaxRows:         int64(len(reference.Msg.GetResultSet().GetRows())),
		BatchSize:       2,
	}))
	s.Require().NoError(err)

	_, batches, stats := s.collectStreamRows(stream)
	s.Require().NotNil(stats)

	streamedIDs := make([]int64, 0, stats.GetRowCount())

	for _, batch := range batches {
		for _, row := range batch.GetRows() {
			streamedIDs = append(streamedIDs, row.GetValues()[0].GetValue().GetInt64Value())
		}
	}

	readRowsIDs := make([]int64, 0, len(reference.Msg.GetResultSet().GetRows()))
	for _, row := range reference.Msg.GetResultSet().GetRows() {
		readRowsIDs = append(readRowsIDs, row.GetValues()[0].GetValue().GetInt64Value())
	}

	s.Equal(readRowsIDs, streamedIDs, "StreamRows should share ReadRows filter/order semantics")

	capped, err := s.tableDataClient.StreamRows(ctx, connect.NewRequest(&consolev1alpha1.StreamRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id", "email"},
		OrderBy:         idAsc,
		BatchSize:       5,
		MaxTotalBytes:   1,
	}))
	s.Require().NoError(err)

	_, cappedBatches, cappedStats := s.collectStreamRows(capped)
	s.Require().NotNil(cappedStats)
	s.Empty(cappedBatches, "a one-byte cap should stop before emitting row batches")
	s.Equal(int64(0), cappedStats.GetRowCount())
	s.True(cappedStats.GetTruncated())

	boundaryReference, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		PageSize:        2,
		SelectedColumns: []string{"id", "email"},
		OrderBy:         idAsc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_FULL,
	}))
	s.Require().NoError(err)
	s.Require().GreaterOrEqual(len(boundaryReference.Msg.GetResultSet().GetRows()), 2)

	firstBatchBytes := proto.Size(&consolev1alpha1.StreamRowsResponse{
		Event: &consolev1alpha1.StreamRowsResponse_Batch{
			Batch: &consolev1alpha1.StreamRowsBatch{
				Rows: boundaryReference.Msg.GetResultSet().GetRows()[:1],
			},
		},
	})

	boundary, err := s.tableDataClient.StreamRows(ctx, connect.NewRequest(&consolev1alpha1.StreamRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id", "email"},
		OrderBy:         idAsc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_FULL,
		BatchSize:       1,
		MaxTotalBytes:   int64(firstBatchBytes),
	}))
	s.Require().NoError(err)

	_, boundaryBatches, boundaryStats := s.collectStreamRows(boundary)
	s.Require().NotNil(boundaryStats)
	s.Require().Len(boundaryBatches, 1, "cap should admit the first batch")
	s.Require().Len(boundaryBatches[0].GetRows(), 1)
	s.Equal(
		boundaryReference.Msg.GetResultSet().GetRows()[0].GetValues()[0].GetValue().GetInt64Value(),
		boundaryBatches[0].GetRows()[0].GetValues()[0].GetValue().GetInt64Value(),
	)
	s.Equal(int64(1), boundaryStats.GetRowCount())
	s.True(boundaryStats.GetTruncated(), "cap should reject the next batch")
}

func (s *RPCSuite) collectStreamRows(stream *connect.ServerStreamForClient[consolev1alpha1.StreamRowsResponse]) (*consolev1alpha1.StreamRowsMetadata, []*consolev1alpha1.StreamRowsBatch, *consolev1alpha1.StreamRowsStats) {
	s.T().Helper()

	var (
		metadata *consolev1alpha1.StreamRowsMetadata
		batches  []*consolev1alpha1.StreamRowsBatch
		stats    *consolev1alpha1.StreamRowsStats
	)

	for stream.Receive() {
		msg := stream.Msg()
		switch event := msg.GetEvent().(type) {
		case *consolev1alpha1.StreamRowsResponse_Metadata:
			s.Nil(metadata, "metadata should be emitted once")
			s.Nil(stats, "metadata should arrive before stats")

			metadata = event.Metadata
		case *consolev1alpha1.StreamRowsResponse_Batch:
			s.NotNil(metadata, "batches should arrive after metadata")
			s.Nil(stats, "batches should arrive before stats")

			batches = append(batches, event.Batch)
		case *consolev1alpha1.StreamRowsResponse_Stats:
			s.NotNil(metadata, "stats should arrive after metadata")
			s.Nil(stats, "stats should be emitted once")
			stats = event.Stats
		default:
			s.FailNowf("unexpected StreamRows event", "%T", event)
		}
	}

	s.Require().NoError(stream.Err())

	return metadata, batches, stats
}

func streamColumnNames(columns []*consolev1alpha1.TableResultColumn) []string {
	names := make([]string, 0, len(columns))
	for _, column := range columns {
		names = append(names, column.GetColumnName())
	}

	return names
}

func (s *RPCSuite) TestReadCellValue_BadToken() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadCellValue(ctx, connect.NewRequest(&consolev1alpha1.ReadCellValueRequest{
		Name:           s.tableName("public", "products"),
		FullValueToken: "not.a.valid.token",
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *RPCSuite) TestReadCellValue_NameTokenMismatch() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		PageSize:        5,
		SelectedColumns: []string{"id", "description"},
		MaxCellBytes:    8,
	}))
	s.Require().NoError(err)

	var token string

	for _, row := range resp.Msg.GetResultSet().GetRows() {
		if t := row.GetValues()[1].GetFullValueToken(); t != "" {
			token = t
			break
		}
	}

	s.Require().NotEmpty(token, "expected a truncation token in the page")

	// Submit the products-bound token against the customers table → reject.
	_, err = s.tableDataClient.ReadCellValue(ctx, connect.NewRequest(&consolev1alpha1.ReadCellValueRequest{
		Name:           s.tableName("public", "customers"),
		FullValueToken: token,
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *RPCSuite) TestReadRows_OffsetWhenNoOrder() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: 5,
	}))
	s.Require().NoError(err)

	// No visible order_by AND a PK exists → server appends id ASC tiebreaker
	// → KEYSET. (chooseStrategy ignores tiebreaker columns; visible order
	// is empty → "every visible NOT NULL" trivially holds.)
	s.Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, resp.Msg.GetResultSet().GetPaginationStrategy())
}

func (s *RPCSuite) TestReadRows_Filter() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Single-leaf filter: is_active = false.
	filter := &consolev1alpha1.RowFilter{
		Node: &consolev1alpha1.RowFilter_Predicate{
			Predicate: &consolev1alpha1.RowPredicate{
				Column:   "is_active",
				Operator: consolev1alpha1.RowPredicate_OPERATOR_EQUAL,
				Values: []*consolev1alpha1.TableValue{
					{Kind: &consolev1alpha1.TableValue_BoolValue{BoolValue: false}},
				},
			},
		},
	}

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:   s.tableName("public", "customers"),
		Filter: filter,
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.GreaterOrEqual(len(rs.GetRows()), 1, "should return at least 1 inactive customer")
	s.LessOrEqual(len(rs.GetRows()), 10, "should return a reasonable number of inactive customers")
}

func (s *RPCSuite) TestReadRows_FilterRecursiveGroup() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// (is_active = false) AND (id IS NOT NULL).
	// Exercises the recursive walker even though semantically trivial.
	filter := &consolev1alpha1.RowFilter{
		Node: &consolev1alpha1.RowFilter_Group{
			Group: &consolev1alpha1.RowFilterGroup{
				Logic: consolev1alpha1.RowFilterGroup_LOGIC_AND,
				Children: []*consolev1alpha1.RowFilter{
					{Node: &consolev1alpha1.RowFilter_Predicate{
						Predicate: &consolev1alpha1.RowPredicate{
							Column:   "is_active",
							Operator: consolev1alpha1.RowPredicate_OPERATOR_EQUAL,
							Values: []*consolev1alpha1.TableValue{
								{Kind: &consolev1alpha1.TableValue_BoolValue{BoolValue: false}},
							},
						},
					}},
					{Node: &consolev1alpha1.RowFilter_Predicate{
						Predicate: &consolev1alpha1.RowPredicate{
							Column:   "id",
							Operator: consolev1alpha1.RowPredicate_OPERATOR_IS_NOT_NULL,
						},
					}},
				},
			},
		},
	}

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:   s.tableName("public", "customers"),
		Filter: filter,
	}))
	s.Require().NoError(err)

	rs := resp.Msg.GetResultSet()
	s.GreaterOrEqual(len(rs.GetRows()), 1, "should return at least 1 inactive customer")
}

func (s *RPCSuite) TestReadRows_TableNotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "nonexistent_table"),
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeTable, s.tableName("public", "nonexistent_table"))
}

func (s *RPCSuite) TestReadRows_FilterValidation_UnknownColumn() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
		Filter: &consolev1alpha1.RowFilter{
			Node: &consolev1alpha1.RowFilter_Predicate{
				Predicate: &consolev1alpha1.RowPredicate{
					Column:   "no_such_column",
					Operator: consolev1alpha1.RowPredicate_OPERATOR_EQUAL,
					Values: []*consolev1alpha1.TableValue{
						{Kind: &consolev1alpha1.TableValue_Int64Value{Int64Value: 1}},
					},
				},
			},
		},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "no_such_column")
}

func (s *RPCSuite) TestReadRows_FilterValidation_LikeOnInt() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
		Filter: &consolev1alpha1.RowFilter{
			Node: &consolev1alpha1.RowFilter_Predicate{
				Predicate: &consolev1alpha1.RowPredicate{
					Column:   "id",
					Operator: consolev1alpha1.RowPredicate_OPERATOR_LIKE,
					Values: []*consolev1alpha1.TableValue{
						{Kind: &consolev1alpha1.TableValue_StringValue{StringValue: "%foo%"}},
					},
				},
			},
		},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "LIKE requires a string column")
}

func (s *RPCSuite) TestReadRows_FilterValidation_BetweenWrongArity() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
		Filter: &consolev1alpha1.RowFilter{
			Node: &consolev1alpha1.RowFilter_Predicate{
				Predicate: &consolev1alpha1.RowPredicate{
					Column:   "id",
					Operator: consolev1alpha1.RowPredicate_OPERATOR_BETWEEN,
					Values: []*consolev1alpha1.TableValue{
						{Kind: &consolev1alpha1.TableValue_Int64Value{Int64Value: 1}},
						{Kind: &consolev1alpha1.TableValue_Int64Value{Int64Value: 2}},
						{Kind: &consolev1alpha1.TableValue_Int64Value{Int64Value: 3}},
					},
				},
			},
		},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "BETWEEN requires exactly two values")
}

func (s *RPCSuite) TestReadRows_FilterValidation_IsNullWithValues() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
		Filter: &consolev1alpha1.RowFilter{
			Node: &consolev1alpha1.RowFilter_Predicate{
				Predicate: &consolev1alpha1.RowPredicate{
					Column:   "id",
					Operator: consolev1alpha1.RowPredicate_OPERATOR_IS_NULL,
					Values: []*consolev1alpha1.TableValue{
						{Kind: &consolev1alpha1.TableValue_Int64Value{Int64Value: 1}},
					},
				},
			},
		},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "takes no values")
}

func (s *RPCSuite) TestReadRows_OrderByUnknownColumn() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name: s.tableName("public", "customers"),
		OrderBy: []*consolev1alpha1.RowOrder{
			{Column: "ghost_column", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
		},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "ghost_column")
}

func (s *RPCSuite) TestReadRows_SelectedColumnsUnknown() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		SelectedColumns: []string{"id", "ghost_column"},
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.Contains(err.Error(), "ghost_column")
}

// TestReadRows_OffsetBudgetCutoffAdvancesByEmittedRows guards against the
// off-by-pageSize bug where a budget-cutoff page minted a continuation
// token that advanced the OFFSET by params.PageSize regardless of how
// many rows were actually emitted, silently dropping the rows in between.
func (s *RPCSuite) TestReadRows_OffsetBudgetCutoffAdvancesByEmittedRows() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// `phone` is nullable on customers — chooseStrategy() forces OFFSET.
	phoneAsc := []*consolev1alpha1.RowOrder{
		{Column: "phone", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	const pageSize = 50

	// Canonical full ordering, no budget — the reference for what rows
	// should appear in what positions.
	canonical, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.tableName("public", "customers"),
		PageSize: pageSize,
		OrderBy:  phoneAsc,
	}))
	s.Require().NoError(err)
	s.Require().Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_OFFSET, canonical.Msg.GetResultSet().GetPaginationStrategy())

	page1, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:             s.tableName("public", "customers"),
		PageSize:         pageSize,
		OrderBy:          phoneAsc,
		MaxResponseBytes: 64,
	}))
	s.Require().NoError(err)
	s.Require().Less(len(page1.Msg.GetResultSet().GetRows()), pageSize, "budget cutoff should emit fewer than pageSize rows")
	s.Require().NotEmpty(page1.Msg.GetNextPageToken(), "budget cutoff must mint a continuation token")

	emitted := len(page1.Msg.GetResultSet().GetRows())

	page2, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:             s.tableName("public", "customers"),
		PageSize:         pageSize,
		OrderBy:          phoneAsc,
		MaxResponseBytes: 64,
		PageToken:        page1.Msg.GetNextPageToken(),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(page2.Msg.GetResultSet().GetRows())

	wantNextID := canonical.Msg.GetResultSet().GetRows()[emitted].GetValues()[0].GetValue().GetInt64Value()
	gotNextID := page2.Msg.GetResultSet().GetRows()[0].GetValues()[0].GetValue().GetInt64Value()
	s.Equal(wantNextID, gotNextID, "page2 must continue at row %d (the row right after page1's last), not jump ahead by PageSize", emitted)
}

// TestReadRows_PreviewJsonbMetadata guards against the bug where PREVIEW
// projects jsonb / array / xml columns through ::text and the response
// reported text/STRING metadata + string_value cells, losing the catalog
// type. Now the public column metadata comes from the catalog and the
// scanned cell uses json_value.
func (s *RPCSuite) TestReadRows_PreviewJsonbMetadata() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		PageSize:        5,
		SelectedColumns: []string{"id", "metadata"},
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_PREVIEW,
		MaxCellBytes:    8,
	}))
	s.Require().NoError(err)

	cols := resp.Msg.GetResultSet().GetColumns()
	s.Require().Len(cols, 2)

	var metaCol *consolev1alpha1.TableResultColumn

	for _, c := range cols {
		if c.GetColumnName() == "metadata" {
			metaCol = c
			break
		}
	}

	s.Require().NotNil(metaCol)
	s.Equal(consolev1alpha1.DataType_DATA_TYPE_JSON, metaCol.GetDataType(), "PREVIEW must preserve catalog data_type for jsonb")
	s.Equal("jsonb", metaCol.GetRawType(), "PREVIEW must preserve catalog raw_type for jsonb")
	s.True(metaCol.GetMayTruncate(), "jsonb is preview-eligible")

	rows := resp.Msg.GetResultSet().GetRows()
	s.Require().NotEmpty(rows)

	// Find the metadata column position (it's index 1 because we selected
	// [id, metadata] in that order).
	for i, row := range rows {
		meta := row.GetValues()[1].GetValue()
		_, ok := meta.GetKind().(*consolev1alpha1.TableValue_JsonValue)
		s.Truef(ok, "row %d metadata cell must be JsonValue, got %T", i, meta.GetKind())
	}
}

// TestReadRows_FieldPathErrors exercises the structured field paths
// surfaced via BadRequest.field_violations. Before the fix every
// engine.ErrQueryInvalid was reported as field="statement"; now the
// validate.go-built path (e.g. order_by[0].column) reaches the client.
func (s *RPCSuite) TestReadRows_FieldPathErrors() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cases := []struct {
		name      string
		req       *consolev1alpha1.ReadRowsRequest
		wantField string
	}{
		{
			name: "selected_columns",
			req: &consolev1alpha1.ReadRowsRequest{
				Name:            s.tableName("public", "customers"),
				SelectedColumns: []string{"ghost_column"},
			},
			wantField: "selected_columns",
		},
		{
			name: "order_by-indexed-column",
			req: &consolev1alpha1.ReadRowsRequest{
				Name: s.tableName("public", "customers"),
				OrderBy: []*consolev1alpha1.RowOrder{
					{Column: "ghost_column", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
				},
			},
			wantField: "order_by[0].column",
		},
		{
			name: "filter-predicate-column",
			req: &consolev1alpha1.ReadRowsRequest{
				Name: s.tableName("public", "customers"),
				Filter: &consolev1alpha1.RowFilter{
					Node: &consolev1alpha1.RowFilter_Predicate{
						Predicate: &consolev1alpha1.RowPredicate{
							Column:   "ghost_column",
							Operator: consolev1alpha1.RowPredicate_OPERATOR_EQUAL,
							Values: []*consolev1alpha1.TableValue{
								{Kind: &consolev1alpha1.TableValue_StringValue{StringValue: "x"}},
							},
						},
					},
				},
			},
			wantField: "filter.predicate.column",
		},
		{
			name: "filter-predicate-like-on-int",
			req: &consolev1alpha1.ReadRowsRequest{
				Name: s.tableName("public", "customers"),
				Filter: &consolev1alpha1.RowFilter{
					Node: &consolev1alpha1.RowFilter_Predicate{
						Predicate: &consolev1alpha1.RowPredicate{
							Column:   "id",
							Operator: consolev1alpha1.RowPredicate_OPERATOR_LIKE,
							Values: []*consolev1alpha1.TableValue{
								{Kind: &consolev1alpha1.TableValue_StringValue{StringValue: "x"}},
							},
						},
					},
				},
			},
			wantField: "filter.predicate.operator",
		},
	}

	for _, tc := range cases {
		s.Run(tc.name, func() {
			_, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(tc.req))
			s.Require().Error(err)
			s.requireFieldViolation(err, tc.wantField)
		})
	}
}

// TestReadRows_KeysetCursor_OrderByUnselectedColumn guards against the
// bug where ORDER BY referenced a column outside selected_columns, so the
// engine never projected it, captureCursorValues fell back to NULL, and
// page 2 keyset compared against NULL.
//
// `email` is a non-nullable text column on customers, so chooseStrategy
// stays on KEYSET even though it's nullable-checked.
func (s *RPCSuite) TestReadRows_KeysetCursor_OrderByUnselectedColumn() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	emailAsc := []*consolev1alpha1.RowOrder{
		{Column: "email", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	const pageSize = 5

	// Canonical, un-paged ordering: full result set sorted by email asc.
	canonical, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:    s.tableName("public", "customers"),
		OrderBy: emailAsc,
	}))
	s.Require().NoError(err)
	s.Require().Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, canonical.Msg.GetResultSet().GetPaginationStrategy())
	s.Require().GreaterOrEqual(len(canonical.Msg.GetResultSet().GetRows()), pageSize*2)

	// Paged read with email in ORDER BY but only `id` in selected_columns.
	page1, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		PageSize:        pageSize,
		SelectedColumns: []string{"id"},
		OrderBy:         emailAsc,
	}))
	s.Require().NoError(err)
	s.Require().Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, page1.Msg.GetResultSet().GetPaginationStrategy())
	s.Require().Len(page1.Msg.GetResultSet().GetRows(), pageSize)
	s.Require().NotEmpty(page1.Msg.GetNextPageToken())

	page2, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "customers"),
		PageSize:        pageSize,
		SelectedColumns: []string{"id"},
		OrderBy:         emailAsc,
		PageToken:       page1.Msg.GetNextPageToken(),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(page2.Msg.GetResultSet().GetRows())

	// Each page's IDs should match the canonical ordering exactly.
	for i, row := range page1.Msg.GetResultSet().GetRows() {
		want := canonical.Msg.GetResultSet().GetRows()[i].GetValues()[0].GetValue().GetInt64Value()
		got := row.GetValues()[0].GetValue().GetInt64Value()
		s.Equalf(want, got, "page1 row %d: canonical id mismatch", i)
	}

	for i, row := range page2.Msg.GetResultSet().GetRows() {
		want := canonical.Msg.GetResultSet().GetRows()[pageSize+i].GetValues()[0].GetValue().GetInt64Value()
		got := row.GetValues()[0].GetValue().GetInt64Value()
		s.Equalf(want, got, "page2 row %d: canonical id mismatch — keyset cursor likely lost the email column", i)
	}
}

// TestReadRows_KeysetCursor_OrderByPreviewTruncatedColumn guards against
// the bug where ORDER BY referenced a column whose public projection was
// preview-truncated, so the cursor captured the truncated prefix and page
// 2 keyset advanced past the wrong row. The dedicated cursor projection
// is un-truncated regardless of preview, so page 2 must align with the
// canonical ordering.
func (s *RPCSuite) TestReadRows_KeysetCursor_OrderByPreviewTruncatedColumn() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	nameAsc := []*consolev1alpha1.RowOrder{
		{Column: "name", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	const pageSize = 5

	canonical, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		SelectedColumns: []string{"id"},
		OrderBy:         nameAsc,
	}))
	s.Require().NoError(err)
	s.Require().GreaterOrEqual(len(canonical.Msg.GetResultSet().GetRows()), pageSize*2)

	page1, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		PageSize:        pageSize,
		SelectedColumns: []string{"id", "name"},
		OrderBy:         nameAsc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_PREVIEW,
		MaxCellBytes:    5,
	}))
	s.Require().NoError(err)
	s.Require().Len(page1.Msg.GetResultSet().GetRows(), pageSize)
	s.Require().NotEmpty(page1.Msg.GetNextPageToken())

	page2, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:            s.tableName("public", "products"),
		PageSize:        pageSize,
		SelectedColumns: []string{"id", "name"},
		OrderBy:         nameAsc,
		CellValueMode:   consolev1alpha1.CellValueMode_CELL_VALUE_MODE_PREVIEW,
		MaxCellBytes:    5,
		PageToken:       page1.Msg.GetNextPageToken(),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(page2.Msg.GetResultSet().GetRows())

	for i, row := range page1.Msg.GetResultSet().GetRows() {
		want := canonical.Msg.GetResultSet().GetRows()[i].GetValues()[0].GetValue().GetStringValue()
		got := row.GetValues()[0].GetValue().GetStringValue()
		s.Equalf(want, got, "page1 row %d: canonical id mismatch under preview truncation", i)
	}

	for i, row := range page2.Msg.GetResultSet().GetRows() {
		want := canonical.Msg.GetResultSet().GetRows()[pageSize+i].GetValues()[0].GetValue().GetStringValue()
		got := row.GetValues()[0].GetValue().GetStringValue()
		s.Equalf(want, got, "page2 row %d: keyset cursor likely captured the 5-byte truncated prefix instead of the full name", i)
	}
}

// TestReadRows_KeysetCursor_PKExcludedFromSelectedColumns asserts the
// invariant that the server appends identity columns to the cursor
// projection (__qlcursor aliases) even when the client omits them from
// selected_columns, so keyset pagination remains stable and every row is
// visited exactly once.
func (s *RPCSuite) TestReadRows_KeysetCursor_PKExcludedFromSelectedColumns() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	idAsc := []*consolev1alpha1.RowOrder{
		{Column: "id", Direction: consolev1alpha1.RowOrder_DIRECTION_ASC},
	}

	const pageSize = 5

	// Canonical id ordering so we know how many rows exist and what their
	// emails look like in PK order.
	canonical, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:    s.tableName("public", "customers"),
		OrderBy: idAsc,
	}))
	s.Require().NoError(err)

	totalRows := len(canonical.Msg.GetResultSet().GetRows())
	s.Require().GreaterOrEqual(totalRows, pageSize*2)

	// Page through with selected_columns excluding the PK ("id"). The
	// server must still keyset over id (PK NOT NULL) and the page payloads
	// must contain only the email column.
	seenEmails := make(map[string]int, totalRows)
	pageToken := ""
	pageCount := 0

	for {
		resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
			Name:            s.tableName("public", "customers"),
			PageSize:        pageSize,
			SelectedColumns: []string{"email"},
			OrderBy:         idAsc,
			PageToken:       pageToken,
		}))
		s.Require().NoError(err)

		rs := resp.Msg.GetResultSet()
		s.Require().Equal(consolev1alpha1.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, rs.GetPaginationStrategy(),
			"omitting PK from selected_columns must not downgrade to OFFSET")
		s.Require().Len(rs.GetColumns(), 1, "only the requested column should be in the result schema")
		s.Require().Equal("email", rs.GetColumns()[0].GetColumnName())

		for _, row := range rs.GetRows() {
			s.Require().Len(row.GetValues(), 1, "row should only carry the email cell, not the PK")
			seenEmails[row.GetValues()[0].GetValue().GetStringValue()]++
		}

		pageCount++

		pageToken = resp.Msg.GetNextPageToken()
		if pageToken == "" {
			break
		}

		s.Require().Less(pageCount, totalRows, "guard against runaway loop")
	}

	s.Len(seenEmails, totalRows, "every row should be visited exactly once")

	for email, count := range seenEmails {
		s.Equalf(1, count, "row %q seen %d times — keyset cursor lost the PK tiebreaker", email, count)
	}
}

func (s *RPCSuite) seedEncodedContentDatabase(
	ctx context.Context,
	database string,
	serverEncoding string,
	defaultClientEncoding string,
	value string,
) {
	s.T().Helper()

	connString, err := s.pgContainer.CreateDatabaseWithEncoding(ctx, database, serverEncoding)
	s.Require().NoError(err)

	db, err := sql.Open("pgx", connString)
	s.Require().NoError(err)

	defer db.Close()

	_, err = db.ExecContext(ctx, `
		CREATE TABLE public.encoding_samples (
			id integer PRIMARY KEY,
			note text NOT NULL
		)
	`)
	s.Require().NoError(err)

	_, err = db.ExecContext(ctx, "INSERT INTO public.encoding_samples (id, note) VALUES ($1, $2)", 1, value)
	s.Require().NoError(err)

	if defaultClientEncoding == "" {
		return
	}

	err = s.pgContainer.SetDatabaseClientEncoding(ctx, database, defaultClientEncoding)
	s.Require().NoError(err)
}

func (s *RPCSuite) readEncodingSampleViaSQL(ctx context.Context, database string) string {
	s.T().Helper()

	stream, err := s.sqlClient.ExecuteQuery(ctx, connect.NewRequest(&consolev1alpha1.ExecuteQueryRequest{
		Parent:    resource.NewDatabaseName(s.instanceID, database).String(),
		Statement: "SELECT note FROM public.encoding_samples WHERE id = 1",
		RowLimit:  1,
	}))
	s.Require().NoError(err)

	var got string

	for stream.Receive() {
		msg := stream.Msg()

		batch, ok := msg.GetResult().(*consolev1alpha1.ExecuteQueryResponse_RowBatch)
		if !ok {
			continue
		}

		rows := batch.RowBatch.GetRows()
		s.Require().Len(rows, 1)

		got = rows[0].GetValues()[0].GetValue().GetStringValue()
	}

	s.Require().NoError(stream.Err())
	s.Require().NotEmpty(got)

	return got
}
