const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../vscode-extension/src/graphify/graph-view-provider.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Extract getHtmlForWebview return content
const startMarker = "private getHtmlForWebview(webview: vscode.Webview, isPanel: boolean = false): string {\n        return `";
const endMarker = "`;\n    }\n}";

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
    console.error('Could not find start of getHtmlForWebview');
    process.exit(1);
}

const htmlStart = startIdx + startMarker.length;
const endIdx = content.indexOf(endMarker, htmlStart);
if (endIdx === -1) {
    console.error('Could not find end of getHtmlForWebview');
    process.exit(1);
}

let htmlContent = content.substring(htmlStart, endIdx);

// Unescape any escaped characters from the TS string template if needed,
// but since it's inside a backtick string in TS, we need to handle expressions like ${...}
htmlContent = htmlContent.replace(/\${!isPanel \? '.*' : ''}/g, '<button class="fullscreen-btn" id="fullscreen-btn" title="Open in Full Panel">FullScreen ⛶</button>');

// Mock VS Code API calls
const mockScript = `
    // --- MOCK VS CODE API FOR STANDALONE BROWSER RUNNING ---
    window.acquireVsCodeApi = function() {
        return {
            postMessage: function(msg) {
                console.log('VSCode PostMessage:', msg);
                if (msg.command === 'requestUpdate') {
                    // Send mock data back
                    window.postMessage({
                        type: 'setGraphData',
                        data: mockGraphData,
                        findings: mockFindings,
                        stats: mockStats
                    }, '*');
                } else if (msg.command === 'getSecurityPath') {
                    // Send mock security path back
                    setTimeout(() => {
                        window.postMessage({
                            type: 'setSecurityPath',
                            attackPath: mockAttackPath,
                            selectedNode: msg.vulnerableFile
                        }, '*');
                    }, 500);
                }
            }
        };
    };

    const mockStats = {
        projectName: 'TaintFlow+-Core-Engine',
        frameworks: ['TypeScript', 'Node.js', 'Express', 'Prisma'],
        lastScanTime: new Date().toISOString(),
        entryPointsCount: 2,
        servicesCount: 6,
        apisCount: 5,
        databasesCount: 1,
        totalFiles: 24,
        totalEdges: 32
    };

    const mockGraphData = {
        nodes: [
            { id: 'src/main.ts', label: 'main.ts', type: 'entrypoint', language: 'typescript', path: 'src/main.ts', lines: 80, isMeaningful: true },
            { id: 'src/app.ts', label: 'app.ts', type: 'entrypoint', language: 'typescript', path: 'src/app.ts', lines: 120, isMeaningful: true },
            
            { id: 'src/controllers/authController.ts', label: 'authController.ts', type: 'service', language: 'typescript', path: 'src/controllers/authController.ts', lines: 150, isMeaningful: true },
            { id: 'src/controllers/userController.ts', label: 'userController.ts', type: 'service', language: 'typescript', path: 'src/controllers/userController.ts', lines: 210, isMeaningful: true },
            { id: 'src/controllers/adminController.ts', label: 'adminController.ts', type: 'service', language: 'typescript', path: 'src/controllers/adminController.ts', lines: 180, isMeaningful: true },
            
            { id: 'src/routes/authRoutes.ts', label: 'authRoutes.ts', type: 'api', language: 'typescript', path: 'src/routes/authRoutes.ts', lines: 60, isMeaningful: true },
            { id: 'src/routes/userRoutes.ts', label: 'userRoutes.ts', type: 'api', language: 'typescript', path: 'src/routes/userRoutes.ts', lines: 90, isMeaningful: true },
            { id: 'src/routes/adminRoutes.ts', label: 'adminRoutes.ts', type: 'api', language: 'typescript', path: 'src/routes/adminRoutes.ts', lines: 85, isMeaningful: true },
            
            { id: 'src/services/userService.ts', label: 'userService.ts', type: 'service', language: 'typescript', path: 'src/services/userService.ts', lines: 340, isMeaningful: true },
            { id: 'src/services/tokenService.ts', label: 'tokenService.ts', type: 'service', language: 'typescript', path: 'src/services/tokenService.ts', lines: 110, isMeaningful: true },
            { id: 'src/services/securityService.ts', label: 'securityService.ts', type: 'service', language: 'typescript', path: 'src/services/securityService.ts', lines: 270, isMeaningful: true },
            
            { id: 'src/db/prisma.ts', label: 'prisma.ts', type: 'database', language: 'typescript', path: 'src/db/prisma.ts', lines: 40, isMeaningful: true },
            { id: 'src/db/userModel.ts', label: 'userModel.ts', type: 'database', language: 'typescript', path: 'src/db/userModel.ts', lines: 130, isMeaningful: true },
            
            { id: 'src/utils/logger.ts', label: 'logger.ts', type: 'file', language: 'typescript', path: 'src/utils/logger.ts', lines: 50, isMeaningful: true },
            { id: 'src/utils/validator.ts', label: 'validator.ts', type: 'file', language: 'typescript', path: 'src/utils/validator.ts', lines: 95, isMeaningful: true }
        ],
        edges: [
            { id: 'src/main.ts->src/app.ts', source: 'src/main.ts', target: 'src/app.ts', type: 'import' },
            { id: 'src/app.ts->src/routes/authRoutes.ts', source: 'src/app.ts', target: 'src/routes/authRoutes.ts', type: 'import' },
            { id: 'src/app.ts->src/routes/userRoutes.ts', source: 'src/app.ts', target: 'src/routes/userRoutes.ts', type: 'import' },
            { id: 'src/app.ts->src/routes/adminRoutes.ts', source: 'src/app.ts', target: 'src/routes/adminRoutes.ts', type: 'import' },
            
            { id: 'src/routes/authRoutes.ts->src/controllers/authController.ts', source: 'src/routes/authRoutes.ts', target: 'src/controllers/authController.ts', type: 'import' },
            { id: 'src/routes/userRoutes.ts->src/controllers/userController.ts', source: 'src/routes/userRoutes.ts', target: 'src/controllers/userController.ts', type: 'import' },
            { id: 'src/routes/adminRoutes.ts->src/controllers/adminController.ts', source: 'src/routes/adminRoutes.ts', target: 'src/controllers/adminController.ts', type: 'import' },
            
            { id: 'src/controllers/authController.ts->src/services/tokenService.ts', source: 'src/controllers/authController.ts', target: 'src/services/tokenService.ts', type: 'import' },
            { id: 'src/controllers/userController.ts->src/services/userService.ts', source: 'src/controllers/userController.ts', target: 'src/services/userService.ts', type: 'import' },
            { id: 'src/controllers/adminController.ts->src/services/userService.ts', source: 'src/controllers/adminController.ts', target: 'src/services/userService.ts', type: 'import' },
            { id: 'src/controllers/adminController.ts->src/services/securityService.ts', source: 'src/controllers/adminController.ts', target: 'src/services/securityService.ts', type: 'import' },
            
            { id: 'src/services/userService.ts->src/db/prisma.ts', source: 'src/services/userService.ts', target: 'src/db/prisma.ts', type: 'import' },
            { id: 'src/services/userService.ts->src/db/userModel.ts', source: 'src/services/userService.ts', target: 'src/db/userModel.ts', type: 'import' },
            { id: 'src/db/userModel.ts->src/db/prisma.ts', source: 'src/db/userModel.ts', target: 'src/db/prisma.ts', type: 'import' },
            
            { id: 'src/controllers/authController.ts->src/utils/logger.ts', source: 'src/controllers/authController.ts', target: 'src/utils/logger.ts', type: 'import' },
            { id: 'src/services/userService.ts->src/utils/validator.ts', source: 'src/services/userService.ts', target: 'src/utils/validator.ts', type: 'import' }
        ]
    };

    const mockFindings = [
        { id: 'finding-1', filePath: 'src/services/userService.ts', fileName: 'userService.ts', message: 'SQL Injection via unsanitized query parameters', severity: 'critical', line: 42, source: 'Prisma Query' },
        { id: 'finding-2', filePath: 'src/controllers/authController.ts', fileName: 'authController.ts', message: 'Hardcoded JWT Secret Key in auth headers', severity: 'high', line: 12, source: 'JWT Config' },
        { id: 'finding-3', filePath: 'src/routes/adminRoutes.ts', fileName: 'adminRoutes.ts', message: 'Broken Object Level Authorization', severity: 'medium', line: 24, source: 'Route Guard' }
    ];

    const mockAttackPath = {
        severity: 'critical',
        steps: [
            { file: 'src/routes/userRoutes.ts', line: 15, description: 'User endpoints receive untrusted query string' },
            { file: 'src/controllers/userController.ts', line: 52, description: 'Query parameters passed to user service unfiltered' },
            { file: 'src/services/userService.ts', line: 42, description: 'Raw SQL query executed on Prisma client causing SQL Injection' },
            { file: 'src/db/prisma.ts', line: 10, description: 'Unchecked database query executes with admin privileges' }
        ]
    };

    // Auto load mock data in browser
    setTimeout(() => {
        window.postMessage({
            type: 'setGraphData',
            data: mockGraphData,
            findings: mockFindings,
            stats: mockStats
        }, '*');
    }, 100);
`;

// Insert mockScript right after acquireVsCodeApi call
htmlContent = htmlContent.replace('const vscode = acquireVsCodeApi();', 'const vscode = acquireVsCodeApi();' + mockScript);

fs.writeFileSync(path.join(__dirname, 'test-webview.html'), htmlContent);
console.log('Saved standalone mockup test-webview.html to scripts directory.');
