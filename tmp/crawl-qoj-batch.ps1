param([int]$Skip = 0, [int]$Take = 10)
$outFile = 'tmp/qoj-crawl.jsonl'
function Get-Mirror($url) {
  $mirror = 'https://r.jina.ai/http://r.jina.ai/http://' + $url
  $r = Invoke-WebRequest -Uri $mirror -UseBasicParsing -TimeoutSec 45
  return $r.Content
}
$list = Get-Mirror('https://qoj.ac/problems?page=1')
$matches = [regex]::Matches($list, '#(\d+)\[([^\]]+)\]\(https?://qoj\.ac/problem/\d+\)') | Select-Object -Skip $Skip -First $Take
foreach ($m in $matches) {
  $id = $m.Groups[1].Value
  $listTitle = $m.Groups[2].Value
  try {
    Write-Output "Fetching QOJ $id $listTitle"
    $raw = Get-Mirror("https://qoj.ac/problem/$id")
    $title = $listTitle
    $tm = [regex]::Match($raw, 'Title:\s*(.+?)\s*-\s*Problem\s*-\s*QOJ\.ac')
    if ($tm.Success) { $title = $tm.Groups[1].Value.Trim() }
    $idx = $raw.IndexOf('Markdown Content:')
    $desc = if ($idx -ge 0) { $raw.Substring($idx + 'Markdown Content:'.Length).Trim() } else { $raw.Trim() }
    $timeLimit = 1000
    $mt = [regex]::Match($desc, 'Time\s*Limit\s*:?\s*\(?\s*([0-9.]+)\s*(ms|s|sec|second|seconds)', 'IgnoreCase')
    if ($mt.Success) { if ($mt.Groups[2].Value.ToLower() -eq 'ms') { $timeLimit = [int][double]$mt.Groups[1].Value } else { $timeLimit = [int]([double]$mt.Groups[1].Value * 1000) } }
    $memoryLimit = 1024
    $mm = [regex]::Match($desc, 'Memory\s*Limit\s*:?\s*\(?\s*([0-9.]+)\s*(MB|MiB|GB|GiB|KB|KiB)', 'IgnoreCase')
    if ($mm.Success) {
      $val = [double]$mm.Groups[1].Value; $unit = $mm.Groups[2].Value.ToLower()
      if ($unit -in @('gb','gib')) { $memoryLimit = [int]($val * 1024) } elseif ($unit -in @('kb','kib')) { $memoryLimit = [Math]::Max(1, [int]($val / 1024)) } else { $memoryLimit = [int]$val }
    }
    $obj = [pscustomobject]@{ remoteId=$id; title="QOJ $id $title"; description=$desc; timeLimit=$timeLimit; memoryLimit=$memoryLimit; url="https://qoj.ac/problem/$id" }
    ($obj | ConvertTo-Json -Compress -Depth 5) | Add-Content -Encoding UTF8 $outFile
    Write-Output "Saved QOJ $id"
    Start-Sleep -Milliseconds 200
  } catch {
    Write-Output "Failed QOJ $id $($_.Exception.Message)"
  }
}
