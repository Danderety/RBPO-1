$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
node scripts/verify.mjs
exit $LASTEXITCODE
