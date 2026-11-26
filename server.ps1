param(
  [int]$Port = 5173
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

Write-Host "Servidor iniciado en http://localhost:$Port/"
Write-Host "Carpeta raiz: $Root"
Write-Host "Presiona Ctrl+C para detener."

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".mp3"  = "audio/mpeg"
  ".wav"  = "audio/wav"
  ".ogg"  = "audio/ogg"
}

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Request = $Context.Request
    $Response = $Context.Response

    try {
      $UrlPath = $Request.Url.AbsolutePath
      if ($UrlPath -eq "/") { $UrlPath = "/index.html" }

      $RelPath = $UrlPath.TrimStart("/").Replace("/", "\")
      $FilePath = Join-Path $Root $RelPath
      $IsHead = $Request.HttpMethod -eq "HEAD"

      if ((Test-Path $FilePath) -and -not (Get-Item $FilePath).PSIsContainer) {
        $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
        $ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
        $Response.ContentType = $ContentType
        $Response.StatusCode = 200
        $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
        $Response.ContentLength64 = $Bytes.Length
        if (-not $IsHead) {
          $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        }
      } else {
        $Response.StatusCode = 404
        $NotFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $UrlPath")
        if (-not $IsHead) {
          $Response.ContentLength64 = $NotFound.Length
          $Response.OutputStream.Write($NotFound, 0, $NotFound.Length)
        }
      }
    } catch {
      # Ignorar errores de conexion cerrada por el cliente
    } finally {
      $Response.Close()
    }
  }
} finally {
  $Listener.Stop()
}
