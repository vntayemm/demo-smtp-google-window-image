$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$natsVersion = if ($env:NATS_VERSION) { $env:NATS_VERSION } else { "2.10.25" }
$dest = "C:\nats"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$url = "https://github.com/nats-io/nats-server/releases/download/v$natsVersion/nats-server-v$natsVersion-windows-amd64.zip"
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile "C:\nats.zip" -UseBasicParsing
Expand-Archive -Path "C:\nats.zip" -DestinationPath "C:\nats-tmp" -Force
Copy-Item -Path "C:\nats-tmp\nats-server-v$natsVersion-windows-amd64\*" -Destination $dest -Recurse -Force
Remove-Item "C:\nats.zip", "C:\nats-tmp" -Recurse -Force
& "$dest\nats-server.exe" -v
