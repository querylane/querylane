package instance

func newTestConnectionGuard() *ConnectionTestGuard {
	guard, _ := NewConnectionTestGuard(1_000_000, 1_000_000, true)

	return guard
}
