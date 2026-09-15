$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$nodeVersion = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { "20.18.1" }
$dest = "C:\nodejs"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$url = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip"
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile "C:\node.zip" -UseBasicParsing
Expand-Archive -Path "C:\node.zip" -DestinationPath "C:\nodejs-tmp" -Force
Copy-Item -Path "C:\nodejs-tmp\node-v$nodeVersion-win-x64\*" -Destination $dest -Recurse -Force
Remove-Item "C:\node.zip", "C:\nodejs-tmp" -Recurse -Force

& "$dest\node.exe" -v
& "$dest\npm.cmd" -v
