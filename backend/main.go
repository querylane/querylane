package main

import (
	"github.com/alecthomas/kong"

	"github.com/querylane/querylane/backend/cmd/migrate"
	"github.com/querylane/querylane/backend/cmd/server"
	"github.com/querylane/querylane/backend/config"
)

type CLI struct {
	config.Globals

	Server  server.Command  `cmd:"" help:"Server operations"`
	Migrate migrate.Command `cmd:"" help:"Database migration operations"`
}

func main() {
	cli := CLI{}
	ctx := kong.Parse(&cli,
		kong.Name("querylane"),
		kong.Description("AI-augmented, open-source, collaborative SQL workspace for devs & analysts."),
		kong.UsageOnError(),
		kong.ConfigureHelp(kong.HelpOptions{Compact: false}),
		kong.Vars{
			"version": "0.0.1",
		},
	)
	err := ctx.Run(&cli.Globals)
	ctx.FatalIfErrorf(err)
}
