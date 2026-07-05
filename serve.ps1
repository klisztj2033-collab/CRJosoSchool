# 簡易静的ファイルサーバー（Node/Python不要）
$Port = 8931
$root = $PSScriptRoot
$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml";
  ".mp3"="audio/mpeg"; ".json"="application/json"; ".ico"="image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rawPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($rawPath -eq "/") { $rawPath = "/index.html" }
    $file = Join-Path $root ($rawPath -replace "/", "\").TrimStart("\")
    $full = [System.IO.Path]::GetFullPath($file)
    if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {
    Write-Host "ERR: $_"
  }
}
