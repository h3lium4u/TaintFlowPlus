import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileNode, GraphEdge, RepositoryMemory } from './graph-types';
import { GraphifyMemoryStore } from './memory-store';

export class RepositoryScanner {
    private memory!: RepositoryMemory;
    private fileWatcher?: vscode.FileSystemWatcher;
    private onMemoryUpdatedEmitter = new vscode.EventEmitter<RepositoryMemory>();
    public onMemoryUpdated = this.onMemoryUpdatedEmitter.event;

    constructor() {
        this.initializeMemory();
    }

    private initializeMemory() {
        const cached = GraphifyMemoryStore.loadMemory();
        if (cached) {
            this.memory = cached;
        } else {
            this.memory = {
                projectName: vscode.workspace.name || 'unnamed-project',
                frameworks: [],
                entryPoints: [],
                services: [],
                apis: [],
                databases: [],
                files: {},
                edges: [],
                lastScanTime: 0
            };
        }
    }

    public getMemory(): RepositoryMemory {
        return this.memory;
    }

    public startWatching() {
        if (this.fileWatcher) return;

        // Watch for file creation, deletion, modification
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        this.fileWatcher.onDidCreate(async (uri) => {
            if (this.isIgnoredPath(uri.fsPath)) return;
            await this.scanFile(uri.fsPath);
            this.rebuildEdgesAndSummaries();
            this.saveAndNotify();
        });

        this.fileWatcher.onDidDelete((uri) => {
            if (this.isIgnoredPath(uri.fsPath)) return;
            const relPath = this.getRelativePath(uri.fsPath);
            if (this.memory.files[relPath]) {
                delete this.memory.files[relPath];
                this.rebuildEdgesAndSummaries();
                this.saveAndNotify();
            }
        });

        this.fileWatcher.onDidChange(async (uri) => {
            if (this.isIgnoredPath(uri.fsPath)) return;
            await this.scanFile(uri.fsPath);
            this.rebuildEdgesAndSummaries();
            this.saveAndNotify();
        });
    }

    public stopWatching() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
    }

    public async performFullScan(progress?: vscode.Progress<{ message?: string; increment?: number }>) {
        this.initializeMemory();
        const root = this.getWorkspaceRoot();
        if (!root) return;

        progress?.report({ message: 'Searching for source files...', increment: 10 });
        
        // Find all files in the workspace (VS Code API is fast)
        const uris = await vscode.workspace.findFiles('**/*', '**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.vscode/**,**/out/**,**/.taintflow/**');
        const totalFiles = uris.length;
        
        progress?.report({ message: `Parsing ${totalFiles} files...`, increment: 10 });

        let processed = 0;
        const batchSize = 50;

        for (const uri of uris) {
            const fsPath = uri.fsPath;
            if (this.isIgnoredPath(fsPath)) continue;

            await this.scanFile(fsPath);
            processed++;

            if (processed % batchSize === 0) {
                // Yield back to the event loop so the editor remains fully responsive
                await new Promise(resolve => setTimeout(resolve, 0));
                const percent = Math.min(80, Math.floor((processed / totalFiles) * 70) + 20);
                progress?.report({ message: `Scanned ${processed}/${totalFiles} files...`, increment: 0 });
            }
        }

        progress?.report({ message: 'Analyzing project framework...', increment: 5 });
        this.detectFrameworks();

        progress?.report({ message: 'Resolving code dependencies...', increment: 5 });
        this.rebuildEdgesAndSummaries();

        this.memory.lastScanTime = Date.now();
        this.saveAndNotify();
        
        progress?.report({ message: 'Repository Scan Complete!', increment: 100 });
    }

    private getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
    }

    private getRelativePath(fsPath: string): string {
        const root = this.getWorkspaceRoot();
        if (!root) return fsPath;
        return path.relative(root, fsPath).replace(/\\/g, '/');
    }

    private isIgnoredPath(fsPath: string): boolean {
        const relPath = this.getRelativePath(fsPath).toLowerCase();
        const ignoredDirs = [
            'node_modules/', 'dist/', 'build/', '.git/', '.vscode/',
            'out/', '.taintflow/', 'bin/', 'obj/', 'vendor/'
        ];
        const ignoredExtensions = [
            '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
            '.zip', '.tar', '.gz', '.rar', '.pdf', '.docx', '.xlsx',
            '.mp4', '.mp3', '.wav', '.mov', '.exe', '.dll', '.so', '.dylib', '.vsix'
        ];

        if (ignoredDirs.some(dir => relPath.startsWith(dir) || relPath.includes('/' + dir))) {
            return true;
        }
        if (ignoredExtensions.some(ext => relPath.endsWith(ext))) {
            return true;
        }
        return false;
    }

    private async scanFile(fsPath: string): Promise<void> {
        if (!fs.existsSync(fsPath)) return;

        try {
            const relPath = this.getRelativePath(fsPath);
            const content = fs.readFileSync(fsPath, 'utf-8');
            const stats = fs.statSync(fsPath);
            
            const lines = content.split(/\r?\n/);
            const extension = path.extname(fsPath).toLowerCase();

            // Basic file info
            const node: FileNode = {
                id: relPath,
                name: path.basename(fsPath),
                type: 'file',
                language: this.mapExtensionToLanguage(extension),
                path: relPath,
                imports: [],
                exports: [],
                metadata: {
                    sizeBytes: stats.size,
                    linesCount: lines.length
                }
            };

            // Parse file imports and exports
            this.extractImportsAndExports(content, node, extension);

            // Classify Node Types based on content or file structure
            this.classifyNode(node, content);

            this.memory.files[relPath] = node;
        } catch (err) {
            console.error(`Graphify: Failed to scan file ${fsPath}:`, err);
        }
    }

    private mapExtensionToLanguage(ext: string): string {
        const mapping: Record<string, string> = {
            '.js': 'javascript', '.jsx': 'javascriptreact',
            '.ts': 'typescript', '.tsx': 'typescriptreact',
            '.py': 'python', '.java': 'java', '.go': 'go',
            '.cpp': 'cpp', '.cc': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
            '.rb': 'ruby', '.rs': 'rust', '.cs': 'csharp',
            '.php': 'php', '.sql': 'sql', '.html': 'html',
            '.r': 'r', '.yaml': 'yaml', '.yml': 'yaml',
            'dockerfile': 'dockerfile'
        };
        return mapping[ext] || 'plaintext';
    }

    private extractImportsAndExports(content: string, node: FileNode, ext: string) {
        const lines = content.split(/\r?\n/);

        // Simple regexes for imports per language group
        const jsImportRegex = /(?:import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
        const pyImportRegex = /^\s*(?:import\s+(\w+)|from\s+([\w\.]+)\s+import)/gm;
        const cLikeImportRegex = /#include\s+["<]([^">]+)[">]/g;
        const phpImportRegex = /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
        const rubyImportRegex = /(?:require|require_relative)\s*['"]([^'"]+)['"]/g;

        let match;
        
        // JS / TS
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            while ((match = jsImportRegex.exec(content)) !== null) {
                const imp = match[1] || match[2];
                if (imp && !imp.startsWith('vscode') && !imp.startsWith('fs') && !imp.startsWith('path')) {
                    node.imports.push(imp);
                }
            }
            // Class/Service/Function Exports
            const jsExportRegex = /export\s+(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
            while ((match = jsExportRegex.exec(content)) !== null) {
                if (match[1]) node.exports.push(match[1]);
            }
        }
        // Python
        else if (ext === '.py') {
            while ((match = pyImportRegex.exec(content)) !== null) {
                const imp = match[1] || match[2];
                if (imp) node.imports.push(imp);
            }
            // Class and def exports
            const pyDefRegex = /^\s*(?:class|def)\s+(\w+)/gm;
            while ((match = pyDefRegex.exec(content)) !== null) {
                if (match[1]) node.exports.push(match[1]);
            }
        }
        // Java
        else if (ext === '.java') {
            const javaImportRegex = /import\s+([\w\.]+);/g;
            while ((match = javaImportRegex.exec(content)) !== null) {
                if (match[1]) node.exports.push(match[1]);
            }
        }
        // C / C++
        else if (['.c', '.cpp', '.cc', '.h', '.hpp'].includes(ext)) {
            while ((match = cLikeImportRegex.exec(content)) !== null) {
                if (match[1]) node.imports.push(match[1]);
            }
        }
        // PHP
        else if (ext === '.php') {
            while ((match = phpImportRegex.exec(content)) !== null) {
                if (match[1]) node.imports.push(match[1]);
            }
        }
        // Ruby
        else if (ext === '.rb') {
            while ((match = rubyImportRegex.exec(content)) !== null) {
                if (match[1]) node.imports.push(match[1]);
            }
        }
    }

    private classifyNode(node: FileNode, content: string) {
        const nameLower = node.name.toLowerCase();
        
        // Check database indicators
        const hasDbImports = /(?:mongodb|mongoose|sequelize|prisma|sqlite3|mysql|pg|redis|db\.connect|connectToDatabase)/i.test(content);
        const isDbFile = nameLower.includes('db') || nameLower.includes('database') || nameLower.includes('schema') || nameLower.includes('model');
        if (isDbFile || hasDbImports) {
            node.metadata.isDatabase = true;
            node.metadata.dbType = hasDbImports ? 'SQL/NoSQL client' : 'Local DB config';
            node.type = 'database';
        }

        // Check services
        if (nameLower.includes('service') || nameLower.includes('provider') || nameLower.includes('manager')) {
            node.metadata.isService = true;
            node.type = 'service';
        }

        // Check controller / routes / apis
        if (nameLower.includes('controller') || nameLower.includes('handler')) {
            node.metadata.isController = true;
            node.type = 'service';
        }

        if (nameLower.includes('route') || nameLower.includes('api') || nameLower.includes('endpoint')) {
            node.metadata.isRoute = true;
            node.type = 'api';
        }

        // Entrypoints
        const isEntry = [
            'index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js',
            'server.ts', 'server.js', 'extension.ts', 'main.py', 'app.py'
        ].includes(node.name.toLowerCase());
        
        if (isEntry) {
            node.type = 'entrypoint';
        }
    }

    private detectFrameworks() {
        const root = this.getWorkspaceRoot();
        if (!root) return;

        const frameworks = new Set<string>();

        // 1. Scan package.json dependencies
        const pkgPath = path.join(root, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                
                if (deps['vscode']) frameworks.add('VS Code Extension');
                if (deps['express']) frameworks.add('Express');
                if (deps['react']) frameworks.add('React');
                if (deps['next']) frameworks.add('Next.js');
                if (deps['@angular/core']) frameworks.add('Angular');
                if (deps['vue']) frameworks.add('Vue');
                if (deps['nest']) frameworks.add('NestJS');
                if (deps['koa']) frameworks.add('Koa');
            } catch {}
        }

        // 2. Scan python requirements.txt / pyproject.toml
        const reqPath = path.join(root, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
            try {
                const req = fs.readFileSync(reqPath, 'utf-8');
                if (req.includes('django')) frameworks.add('Django');
                if (req.includes('flask')) frameworks.add('Flask');
                if (req.includes('fastapi')) frameworks.add('FastAPI');
            } catch {}
        }

        this.memory.frameworks = Array.from(frameworks);
    }

    private rebuildEdgesAndSummaries() {
        const edges: GraphEdge[] = [];
        const filesMap = this.memory.files;
        const filePaths = Object.keys(filesMap);

        // Clear summaries
        this.memory.entryPoints = [];
        this.memory.services = [];
        this.memory.apis = [];
        this.memory.databases = [];

        for (const [relPath, node] of Object.entries(filesMap)) {
            // Update lists
            if (node.type === 'entrypoint') this.memory.entryPoints.push(relPath);
            if (node.type === 'service') this.memory.services.push(relPath);
            if (node.type === 'api') this.memory.apis.push(relPath);
            if (node.type === 'database') this.memory.databases.push(relPath);

            // Rebuild edges
            for (const imp of node.imports) {
                // Try to resolve imports to relative paths in the workspace
                const resolved = this.resolveImport(imp, relPath, filePaths);
                if (resolved && resolved !== relPath) {
                    const edgeExists = edges.some(e => e.source === relPath && e.target === resolved);
                    if (!edgeExists) {
                        edges.push({
                            source: relPath,
                            target: resolved,
                            type: 'import'
                        });
                    }
                }
            }
        }

        this.memory.edges = edges;
    }

    private resolveImport(importText: string, currentFile: string, allFiles: string[]): string | undefined {
        // 1. Direct path resolution (e.g. `./utils` or `../services/user`)
        if (importText.startsWith('.')) {
            const currentDir = path.dirname(currentFile);
            let resolved = path.join(currentDir, importText).replace(/\\/g, '/');

            // Find matching file in our files array by adding extensions
            const extensions = ['', '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs'];
            for (const ext of extensions) {
                const testPath = resolved + ext;
                const normalized = path.normalize(testPath).replace(/\\/g, '/');
                if (allFiles.includes(normalized)) return normalized;
            }
        }

        // 2. Named alias or exact module resolution
        const namePart = path.basename(importText).toLowerCase();
        for (const file of allFiles) {
            const base = path.basename(file, path.extname(file)).toLowerCase();
            if (base === namePart) {
                return file;
            }
        }

        return undefined;
    }

    private saveAndNotify() {
        GraphifyMemoryStore.saveMemory(this.memory);
        this.onMemoryUpdatedEmitter.fire(this.memory);
    }
}
