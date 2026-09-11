$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24+ first: winget install OpenJS.NodeJS.LTS' }
node server.mjs
