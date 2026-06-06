# Powershell script to clean and reinstall TaintFlow+ across Cursor & VS Code
$ErrorActionPreference = "Stop"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "    TaintFlow+ Aggressive Reinstall & Clean      " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

$root = "D:\VeriBuild"
$packageJson = Get-Content -Raw -Path "$root\vscode-extension\package.json" | ConvertFrom-Json
$version = $packageJson.version
$extName = "taintflow.taintflow-$version"
$vsixName = "taintflow-$version.vsix"

# 1. Compile everything in the workspace
Write-Host "`n[1/5] Compiling extension and MCP server..." -ForegroundColor Yellow

# Compile VS Code Extension (with Graphify)
cd "$root\vscode-extension"
npm install --prefer-offline
npm run compile

# Compile MCP Server
cd "$root\mcp-server"
npm install --prefer-offline
npx tsc -p tsconfig.json

# 2. Package VSIX
Write-Host "`n[2/5] Packaging VSIX..." -ForegroundColor Yellow
cd "$root\vscode-extension"
if (Test-Path "$root\$vsixName") { Remove-Item "$root\$vsixName" -Force }
npx @vscode/vsce package --no-dependencies --out "$root\$vsixName" --allow-missing-repository

# 3. Clean and Stage for IDEs
$paths = @(
    "$env:USERPROFILE\.cursor\extensions",
    "$env:USERPROFILE\.vscode\extensions",
    "$env:USERPROFILE\.antigravity\extensions"
)

Write-Host "`n[3/5] Cleaning and installing to IDE extensions..." -ForegroundColor Yellow

# Function to safely replace/install extension
function Install-Extension-To-Path($targetParent) {
    if (-not (Test-Path $targetParent)) {
        Write-Host "Target path does not exist, skipping: $targetParent" -ForegroundColor Gray
        return
    }

    Write-Host "Processing extension directory: $targetParent" -ForegroundColor Gray

    # Find any existing taintflow or veribuild folders
    $existingDirs = Get-ChildItem $targetParent | Where-Object { $_.Name -like "*taintflow*" -or $_.Name -like "*veribuild*" }

    foreach ($dir in $existingDirs) {
        $dirPath = $dir.FullName
        Write-Host "Found old extension directory: $dirPath" -ForegroundColor Gray
        try {
            # Try to delete it
            Remove-Item $dirPath -Recurse -Force
            Write-Host "Successfully deleted: $dir.Name" -ForegroundColor Green
        } catch {
            # If locked, rename it so we can put the new one in its place
            $rand = Get-Random
            $newName = "$($dir.Name).old-$rand"
            Write-Host "Directory locked. Renaming to $newName to bypass lock..." -ForegroundColor DarkYellow
            Rename-Item -Path $dirPath -NewName $newName -Force
        }
    }

    # Now create the fresh directory
    $newDir = Join-Path $targetParent $extName
    New-Item -ItemType Directory -Path $newDir -Force | Out-Null

    # Extract VSIX contents into it
    $tempDir = Join-Path $env:TEMP "taintflow_extract_$($rand)"
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory("$root\$vsixName", $tempDir)

    # Copy files from 'extension' folder in VSIX to the target directory
    $srcFolder = Join-Path $tempDir "extension"
    Copy-Item "$srcFolder\*" $newDir -Recurse -Force
    
    # Clean up temp
    Remove-Item $tempDir -Recurse -Force
    Write-Host "Installed clean TaintFlow+ $version into: $newDir" -ForegroundColor Green
}

foreach ($p in $paths) {
    Install-Extension-To-Path $p
}

# 4. Setup MCP servers
Write-Host "`n[4/5] Running MCP configurations..." -ForegroundColor Yellow
cd $root
node scripts\setup-mcp.js

# 5. Clean stale logs
if (Test-Path "activation_debug.log") { Clear-Content "activation_debug.log" -ErrorAction SilentlyContinue }

Write-Host "`n==============================================" -ForegroundColor Green
Write-Host "  TaintFlow+ Reinstalled Successfully!         " -ForegroundColor Green
Write-Host "  Please reload/restart Cursor and VS Code now." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
