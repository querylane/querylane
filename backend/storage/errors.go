package storage

import (
	"errors"

	"github.com/querylane/querylane/backend/aip"
)

// Generic repository errors that can be used across all repository implementations.
// These provide a consistent error interface for common database operations.
var (
	// ErrNotFound indicates that the requested resource was not found.
	ErrNotFound = errors.New("resource not found")

	// ErrAlreadyExists indicates that the resource we tried to create already exists.
	ErrAlreadyExists = errors.New("resource already exists")

	// ErrInvalidInput indicates that the input provided to the repository method is invalid.
	ErrInvalidInput = errors.New("invalid input")

	// ErrInvalidReference indicates a foreign key constraint violation.
	ErrInvalidReference = errors.New("invalid reference")

	// ErrConcurrentModification indicates that the resource was modified by another process.
	ErrConcurrentModification = errors.New("resource was modified concurrently")

	// ErrTransactionFailed indicates that a transaction operation failed.
	ErrTransactionFailed = errors.New("transaction failed")

	// ErrConfigManaged indicates that the operation is not supported because
	// instances are managed via the configuration file.
	ErrConfigManaged = errors.New("instances are managed via configuration file")

	// ErrInvalidOrderBy indicates that the order_by parameter contains invalid field names or syntax.
	ErrInvalidOrderBy = aip.ErrInvalidOrderBy

	// ErrInvalidPageToken indicates that the page_token parameter is malformed or invalid.
	ErrInvalidPageToken = aip.ErrInvalidPageToken

	// ErrFilterMismatch indicates that the filter parameter doesn't match the one used to create the page token.
	ErrFilterMismatch = aip.ErrFilterMismatch

	// ErrInvalidFilter indicates that the filter parameter is malformed or uses
	// an expression the resource does not support.
	ErrInvalidFilter = aip.ErrInvalidFilter
)
