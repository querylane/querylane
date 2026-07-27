// Package buildstamp exposes metadata injected into Querylane binaries at build time.
package buildstamp

var (
	Version   = "dev"
	GitCommit string
	GitBranch = "unknown"
	BuiltAt   string
)
