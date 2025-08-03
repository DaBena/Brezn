use brezn::cli::CliInterface;
use anyhow::Result;

fn main() -> Result<()> {
    let cli = CliInterface::new()?;
    cli.run()
}