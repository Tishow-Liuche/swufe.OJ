$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json

foreach ($asset in $manifest.assets) {
  $outputPath = Join-Path $repoRoot $asset.output
  $outputDir = Split-Path -Parent $outputPath
  if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  }

  $out = [System.IO.File]::Create($outputPath)
  try {
    foreach ($part in $asset.parts) {
      $partPath = Join-Path $PSScriptRoot $part.file
      $actualPartHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $partPath).Hash.ToLowerInvariant()
      if ($actualPartHash -ne $part.sha256) {
        throw "Part hash mismatch: $($part.file)"
      }
      $bytes = [System.IO.File]::ReadAllBytes($partPath)
      $out.Write($bytes, 0, $bytes.Length)
    }
  } finally {
    $out.Dispose()
  }

  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath).Hash.ToLowerInvariant()
  if ($actualHash -ne $asset.sha256) {
    throw "Restored file hash mismatch: $($asset.output)"
  }
  Write-Output "Restored $($asset.output)"
}
