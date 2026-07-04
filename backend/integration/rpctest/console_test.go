package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *RPCSuite) TestGetConsoleConfig() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.consoleClient.GetConsoleConfig(ctx, connect.NewRequest(&consolev1alpha1.GetConsoleConfigRequest{}))
	s.Require().NoError(err)
	s.NotNil(resp.Msg.GetBuildInfo(), "build info should be present")
}
