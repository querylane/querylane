// Package buildstamp exposes metadata injected into Querylane binaries at build time.
package buildstamp

import "runtime/debug"

var (
	Version   = "dev"
	GitCommit string
	GitBranch = "unknown"
	BuiltAt   string
)

// CurrentVersion returns the linker-stamped version, falling back to the Go
// module version for tagged source installs and to dev for local builds.
func CurrentVersion() string {
	buildInfo, _ := debug.ReadBuildInfo()

	return ResolveVersion(Version, buildInfo)
}

// ResolveVersion selects the most specific available build version.
func ResolveVersion(stampedVersion string, buildInfo *debug.BuildInfo) string {
	if stampedVersion != "" && stampedVersion != "dev" {
		return stampedVersion
	}

	if buildInfo != nil && buildInfo.Main.Version != "" && buildInfo.Main.Version != "(devel)" {
		return buildInfo.Main.Version
	}

	if stampedVersion != "" {
		return stampedVersion
	}

	return "unknown"
}
