const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runCommand(command, cwd) {
    console.log(`\n========================================`);
    console.log(`Running: ${command}`);
    console.log(`In directory: ${cwd || process.cwd()}`);
    console.log(`========================================\n`);
    execSync(command, { cwd, stdio: 'inherit' });
}

function copyFileSync(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
}

async function main() {
    const rootDir = path.resolve(__dirname, '..');
    
                
    const rulesSrc = path.join(rootDir, 'security_rules.json');
    const rulesDest = path.join(rootDir, 'vscode-extension', 'security_rules.json');
    copyFileSync(rulesSrc, rulesDest);

    // 2. Build vscode-extension
    const vscodeDir = path.join(rootDir, 'vscode-extension');
    runCommand('npm install', vscodeDir);
    runCommand('npm run compile', vscodeDir);

    // 3. Build antigravity-skill
    const mcpDir = path.join(rootDir, 'antigravity-skill');
    runCommand('npm install', mcpDir);
    runCommand('npm run compile', mcpDir);

    // 4. Build oxp-server
    const oxpDir = path.join(rootDir, 'oxp-server');
    runCommand('npm install', oxpDir);
    runCommand('npm run build', oxpDir);

    // 5. Build mcp-server
    const mcpServerDir = path.join(rootDir, 'mcp-server');
    runCommand('npm install', mcpServerDir);
    runCommand('npm run build', mcpServerDir);

    // 6. Package VS Code Extension using vsce
    console.log('\nPackaging VS Code Extension...');
    try {
        // Clean up old vsix files first
        const filesBefore = fs.readdirSync(vscodeDir);
        for (const file of filesBefore) {
            if (file.endsWith('.vsix')) {
                fs.unlinkSync(path.join(vscodeDir, file));
            }
        }

        runCommand('npx -y @vscode/vsce package --no-dependencies', vscodeDir);
        
        // Find the packaged .vsix file and copy it to root
        const files = fs.readdirSync(vscodeDir);
        const vsixFile = files.find(f => f.endsWith('.vsix'));
        if (vsixFile) {
            const vsixSrc = path.join(vscodeDir, vsixFile);
            const vsixDest = path.join(rootDir, vsixFile);
            copyFileSync(vsixSrc, vsixDest);
            console.log(`\nSuccess! Packaged VSIX created at: ${vsixDest}`);
        } else {
            console.warn('VSIX file not found in vscode-extension folder after packaging.');
        }
    } catch (err) {
        console.error('Failed to package VSIX using vsce:', err.message || err);
    }
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
