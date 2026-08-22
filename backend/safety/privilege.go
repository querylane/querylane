package safety

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

type instanceSessionOpener interface {
	OpenInstance(context.Context, resource.InstanceName) (engine.InstanceSession, error)
}

var errEmptyServerInfo = errors.New("empty server information")

// LogPrivilegedInstanceRoles performs a bounded, best-effort startup check for
// roles that make PostgreSQL read-only transactions an incomplete containment
// boundary. It never blocks server readiness.
func LogPrivilegedInstanceRoles(ctx context.Context, instances storage.InstanceReader, sessions instanceSessionOpener) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	pageToken := ""
	for {
		page, nextPageToken, err := instances.ListInstances(ctx, 1000, pageToken, "", "")
		if err != nil {
			slog.WarnContext(ctx, "could not check instance role privileges at startup", slog.String("error", err.Error()))
			return
		}

		for _, instance := range page {
			name, err := resource.ParseInstanceName(instance.GetName())
			if err != nil {
				logPrivilegeProbeError(ctx, instance.GetName(), err)
				continue
			}

			session, err := sessions.OpenInstance(ctx, name)
			if err != nil {
				logPrivilegeProbeError(ctx, name.String(), err)
				continue
			}

			info, infoErr := session.GetServerInfo(ctx)
			if closeErr := session.Close(); closeErr != nil {
				slog.WarnContext(ctx, "could not close PostgreSQL privilege probe session",
					slog.String("instance", name.String()),
					slog.String("error", closeErr.Error()))
			}

			if infoErr != nil {
				logPrivilegeProbeError(ctx, name.String(), infoErr)
				continue
			}

			if info == nil {
				logPrivilegeProbeError(ctx, name.String(), errEmptyServerInfo)
				continue
			}

			if !info.ConnectedRoleIsSuperuser && !info.ConnectedRoleCanExecuteServerProgram {
				continue
			}

			slog.WarnContext(ctx, "privileged PostgreSQL role weakens read-only containment",
				slog.String("instance", name.String()),
				slog.String("role", info.ConnectedRole),
				slog.Bool("superuser", info.ConnectedRoleIsSuperuser),
				slog.Bool("can_execute_server_program", info.ConnectedRoleCanExecuteServerProgram),
				slog.String("guidance", "use a reduced-privilege role; read-only transactions do not block COPY PROGRAM or external side effects"))
		}

		if nextPageToken == "" {
			return
		}

		pageToken = nextPageToken
	}
}

func logPrivilegeProbeError(ctx context.Context, instance string, err error) {
	slog.WarnContext(ctx, "could not check PostgreSQL role privileges",
		slog.String("instance", instance),
		slog.String("error", err.Error()))
}
