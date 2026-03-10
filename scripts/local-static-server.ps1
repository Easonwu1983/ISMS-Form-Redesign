param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$Port = 8080
)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
}

try {
  $listener.Start()
  Write-Host "Serving $Root at http://127.0.0.1:$Port"

  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
    } catch {
      break
    }

    try {
      $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      if ([string]::IsNullOrWhiteSpace($requestPath) -or $requestPath -eq '/') {
        $requestPath = '/index.html'
      }

      $relativePath = $requestPath.TrimStart('/').Replace('/', '\')
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $Root $relativePath))

      if (-not $filePath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $filePath -PathType Leaf)) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $context.Response.StatusCode = 404
        $context.Response.ContentType = 'text/plain; charset=utf-8'
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $context.Response.StatusCode = 200
      $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }

  $listener.Close()
}
