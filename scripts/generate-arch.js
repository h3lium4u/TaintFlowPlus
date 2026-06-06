const fs = require('fs');
const path = require('path');

const srcDir = path.join('d:/TaintFlow+', 'src');

const files = {
  'state.ts': `
import * as vscode from 'vscode';
import { TaintFlowEngine, Finding } from './taintflow-core';

export class TaintFlowState {
    public static engine: TaintFlowEngine;
    public static outputChannel: vscode.OutputChannel;
    public static context: vscode.ExtensionContext;
    public static diagnosticCollection: vscode.DiagnosticCollection;
    
    // uri string -> findings
    public static findingsCache = new Map<string, Finding[]>();
    
    // For tracking which files are currently being verified
    public static activeVerifications = new Map<string, boolean>();
    
    // Notify sidebar to refresh
    public static onFindingsChanged = new vscode.EventEmitter<void>();
}
`,
  'statusbar/index.ts': `
import * as vscode from 'vscode';
import { TaintFlowState } from '../state';

let statusBarItem: vscode.StatusBarItem;

export function initStatusBar(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'taintflow.showStatus';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
}

export function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('taintflow');
    const autoVerify = config.get<boolean>('autoVerify', true);
    
    if (!autoVerify) {
        statusBarItem.text = '$(debug-pause) TaintFlow+: Paused';
        statusBarItem.tooltip = 'TaintFlow+ is paused. Click to settings.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.show();
        return;
    }

    let totalFindings = 0;
    let criticalCount = 0;
    let highCount = 0;
    
    for (const findings of TaintFlowState.findingsCache.values()) {
        for (const f of findings) {
            totalFindings++;
            if (f.severity === 'critical') criticalCount++;
            if (f.severity === 'high') highCount++;
        }
    }

    if (totalFindings === 0) {
        statusBarItem.text = \`$(shield) TaintFlow+: Clean\`;
        statusBarItem.tooltip = \`TaintFlow+ Dashboard | Active (\${TaintFlowState.engine?.activeModel || 'None'})\`;
        statusBarItem.backgroundColor = undefined;
    } else if (criticalCount > 0 || highCount > 0) {
        statusBarItem.text = \`$(shield) TaintFlow+: \${criticalCount} Critical | \${highCount} High\`;
        statusBarItem.tooltip = \`TaintFlow+ has found critical/high issues. Click to view.\`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
        statusBarItem.text = \`$(shield) TaintFlow+: \${totalFindings} Issues\`;
        statusBarItem.tooltip = \`TaintFlow+ has found issues. Click to view.\`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    
    statusBarItem.command = 'taintflow.sidebar.focus';
    if (totalFindings === 0) {
        statusBarItem.command = 'taintflow.showStatus';
    }
    
    statusBarItem.show();
}
`,
  'diagnostics/index.ts': `
import * as vscode from 'vscode';
import { Finding } from '../taintflow-core';
import { TaintFlowState } from '../state';

export class TaintFlowDiagnostic extends vscode.Diagnostic {
    constructor(
        range: vscode.Range,
        message: string,
        severity: vscode.DiagnosticSeverity,
        public suggestedFix?: string,
        public findingId?: string
    ) {
        super(range, message, severity);
        this.source = 'TaintFlow+';
    }
}

export function updateDiagnostics(document: vscode.TextDocument, findings: Finding[]) {
    const diagnostics: TaintFlowDiagnostic[] = [];
    
    for (const f of findings) {
        const startLine = Math.max(0, f.lineStart - 1);
        const endLine = Math.max(0, f.lineEnd - 1);
        
        if (endLine >= document.lineCount) continue;
        
        const lineText = document.lineAt(endLine).text;
        const range = new vscode.Range(startLine, 0, endLine, lineText.length);
        
        let severity = vscode.DiagnosticSeverity.Warning;
        if (f.severity === 'critical' || f.severity === 'high') {
            severity = vscode.DiagnosticSeverity.Error;
        } else if (f.severity === 'medium') {
            severity = vscode.DiagnosticSeverity.Warning;
        } else if (f.severity === 'low') {
            severity = vscode.DiagnosticSeverity.Information;
        }

        const diag = new TaintFlowDiagnostic(range, \`[\${f.source}] \${f.message}\`, severity, f.suggestedFix);
        diagnostics.push(diag);
    }

    TaintFlowState.diagnosticCollection.set(document.uri, diagnostics);
}

export class TaintFlowCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const codeActions: vscode.CodeAction[] = [];
        const diagnostics = context.diagnostics.length > 0
            ? context.diagnostics
            : (TaintFlowState.diagnosticCollection.get(document.uri) || []);

        for (const diagnostic of diagnostics) {
            if (diagnostic.source !== 'TaintFlow+') continue;

            const customDiag = diagnostic as TaintFlowDiagnostic;
            if (customDiag.suggestedFix) {
                const cleanMsg = customDiag.message.startsWith('[')
                    ? customDiag.message.substring(customDiag.message.indexOf(']') + 1).trim()
                    : customDiag.message;

                const action = new vscode.CodeAction(\`Apply Fix: \${cleanMsg}\`, vscode.CodeActionKind.QuickFix);
                action.diagnostics = [customDiag];
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, customDiag.range, customDiag.suggestedFix);
                action.edit = edit;
                action.isPreferred = true;
                codeActions.push(action);
            }
        }
        return codeActions;
    }
}
`,
  'sidebar/TaintFlowProvider.ts': `
import * as vscode from 'vscode';
import * as path from 'path';
import { Finding } from '../taintflow-core';
import { TaintFlowState } from '../state';

export class TaintFlowSidebarProvider implements vscode.TreeDataProvider<FindingItem | CategoryItem | FileItem | SummaryItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<FindingItem | CategoryItem | FileItem | SummaryItem | undefined | void> = new vscode.EventEmitter<FindingItem | CategoryItem | FileItem | SummaryItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FindingItem | CategoryItem | FileItem | SummaryItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {
        TaintFlowState.onFindingsChanged.event(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FindingItem | CategoryItem | FileItem | SummaryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FindingItem | CategoryItem | FileItem | SummaryItem): Thenable<(FindingItem | CategoryItem | FileItem | SummaryItem)[]> {
        if (!element) {
            // Root elements
            const allFindings: { uri: string, findings: Finding[] }[] = [];
            let total = 0, critical = 0, high = 0, medium = 0, low = 0;
            
            for (const [uri, findings] of TaintFlowState.findingsCache.entries()) {
                if (findings.length > 0) {
                    allFindings.push({ uri, findings });
                    total += findings.length;
                    for (const f of findings) {
                        if (f.severity === 'critical') critical++;
                        else if (f.severity === 'high') high++;
                        else if (f.severity === 'medium') medium++;
                        else if (f.severity === 'low') low++;
                    }
                }
            }

            if (total === 0) {
                return Promise.resolve([new vscode.TreeItem("✅ No vulnerabilities found", vscode.TreeItemCollapsibleState.None)]);
            }

            return Promise.resolve([
                new SummaryItem(total, critical, high, medium, low),
                new CategoryItem('Critical', critical, 'critical', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryItem('High', high, 'high', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryItem('Medium', medium, 'medium', vscode.TreeItemCollapsibleState.Collapsed),
                new CategoryItem('Low', low, 'low', vscode.TreeItemCollapsibleState.Collapsed)
            ]);
        } else if (element instanceof CategoryItem) {
            // Group by file
            const filesWithSeverity = new Map<string, Finding[]>();
            
            for (const [uri, findings] of TaintFlowState.findingsCache.entries()) {
                const relevantFindings = findings.filter(f => f.severity === element.severity);
                if (relevantFindings.length > 0) {
                    filesWithSeverity.set(uri, relevantFindings);
                }
            }

            const children: FileItem[] = [];
            for (const [uri, findings] of filesWithSeverity.entries()) {
                children.push(new FileItem(vscode.Uri.parse(uri), findings, element.severity));
            }
            return Promise.resolve(children);

        } else if (element instanceof FileItem) {
            // List findings in the file
            const children: FindingItem[] = element.findings.map(f => new FindingItem(f, element.uri));
            return Promise.resolve(children);
        }

        return Promise.resolve([]);
    }
}

class SummaryItem extends vscode.TreeItem {
    constructor(total: number, critical: number, high: number, medium: number, low: number) {
        super(\`Dashboard Summary\`, vscode.TreeItemCollapsibleState.None);
        this.description = \`\${total} Issues\`;
        this.tooltip = \`Critical: \${critical}\\nHigh: \${high}\\nMedium: \${medium}\\nLow: \${low}\`;
        this.iconPath = new vscode.ThemeIcon('dashboard');
    }
}

class CategoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly count: number,
        public readonly severity: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(\`\${label} (\${count})\`, collapsibleState);
        if (count === 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        
        switch (severity) {
            case 'critical': this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed')); break;
            case 'high': this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconFailed')); break;
            case 'medium': this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('testing.iconQueued')); break;
            case 'low': this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')); break;
        }
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly findings: Finding[],
        public readonly severity: string
    ) {
        super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.Expanded);
        this.description = \`\${findings.length} issues\`;
        this.resourceUri = uri;
        this.iconPath = vscode.ThemeIcon.File;
    }
}

export class FindingItem extends vscode.TreeItem {
    constructor(
        public readonly finding: Finding,
        public readonly uri: vscode.Uri
    ) {
        super(\`Line \${finding.lineStart}: \${finding.message}\`, vscode.TreeItemCollapsibleState.None);
        this.description = finding.source;
        this.tooltip = finding.message;
        
        // Command to open file at line
        this.command = {
            command: 'taintflow.openFile',
            title: 'Open File',
            arguments: [this.uri, finding.lineStart]
        };
        
        this.contextValue = 'findingItem'; // Used for inline action buttons
    }
}
`,
  'notifications/index.ts': `
import * as vscode from 'vscode';

export function showSummaryNotification(totalFindings: number, fileCount: number) {
    if (totalFindings === 0) {
        vscode.window.showInformationMessage(\`TaintFlow+ Scan Complete: ✅ No vulnerabilities found.\`);
    } else {
        vscode.window.showWarningMessage(
            \`TaintFlow+ Scan Complete: Found \${totalFindings} vulnerabilities across \${fileCount} files.\`,
            'Open Dashboard',
            'Fix All with Antigravity'
        ).then(selection => {
            if (selection === 'Open Dashboard') {
                vscode.commands.executeCommand('taintflow.sidebar.focus');
            } else if (selection === 'Fix All with Antigravity') {
                vscode.commands.executeCommand('taintflow.fixAll');
            }
        });
    }
}
`,
  'antigravity/index.ts': `
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Finding } from '../taintflow-core';
import { TaintFlowState } from '../state';

export async function generateAndShowFixPrompt(document: vscode.TextDocument, findings: Finding[]) {
    const relativePath = vscode.workspace.workspaceFolders 
        ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, document.fileName)
        : document.fileName;

    const findingsText = findings.map(f => \`- Line \${f.lineStart}: [\${f.severity.toUpperCase()}] \${f.message}\`).join('\\n');
    
    const fixPrompt = \`Hi Antigravity, please fix the following vulnerabilities in \${relativePath}:\\n\\n\${findingsText}\\n\\nPlease update the file to resolve these issues securely.\`;

    await writeAntigravityPrompt(document, fixPrompt);
    
    // Auto-copy to clipboard
    await vscode.env.clipboard.writeText(fixPrompt);
    vscode.window.showInformationMessage('TaintFlow+: Fix prompt copied to clipboard! Paste it into Antigravity.');
}

export async function writeAntigravityPrompt(document: vscode.TextDocument, fixPrompt: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;
    const rootPath = workspaceFolders[0].uri.fsPath;
    const promptPath = path.join(rootPath, 'fix_prompt.md');

    const fileContent = \`# Fix Request for Antigravity Agent\\n\\n\` +
        \`This file contains the generated prompt to fix vulnerabilities in your code.\\n\` +
        \`You can copy the prompt below and paste it into the Antigravity chat, or let Antigravity read this file directly.\\n\\n\` +
        \`---\\n\\n\` +
        \`\${fixPrompt}\\n\`;

    try {
        fs.writeFileSync(promptPath, fileContent, 'utf-8');
        TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Generated fix prompt written to \${promptPath}\`);
    } catch (err) {
        TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Failed to write fix prompt: \${err}\`);
    }
}

export async function updateAutoFixPromptFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return;
    const rootPath = workspaceFolders[0].uri.fsPath;
    const promptPath = path.join(rootPath, 'fix_prompt.md');

    let totalFindingsCount = 0;
    const promptSections: string[] = [];

    for (const [uriStr, findings] of TaintFlowState.findingsCache.entries()) {
        if (findings.length === 0) continue;
        
        const uri = vscode.Uri.parse(uriStr);
        const relativePath = path.relative(rootPath, uri.fsPath).replace(/\\\\/g, '/');
        
        const findingsText = findings
            .map(f => \`- Line \${f.lineStart}: [\${f.severity.toUpperCase()}] \${f.message}\`)
            .join('\\n');
        
        promptSections.push(\`### File: \${relativePath}\\n\${findingsText}\`);
        totalFindingsCount += findings.length;
    }

    if (totalFindingsCount === 0) {
        try {
            if (fs.existsSync(promptPath)) {
                fs.unlinkSync(promptPath);
                TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Deleted fix_prompt.md because no risks are present.\`);
            }
        } catch (err) {
            TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Failed to delete fix_prompt.md: \${err}\`);
        }
        return;
    }

    const unifiedPrompt = \`Hi Antigravity, please fix the following vulnerabilities across the project:\\n\\n\` +
        promptSections.join('\\n\\n') +
        \`\\n\\nPlease update these files to resolve the vulnerabilities securely.\`;

    const fileContent = \`# Fix Request for Antigravity Agent\\n\\n\` +
        \`This file contains the generated prompt to fix all vulnerabilities in the project.\\n\` +
        \`You can copy the prompt below and paste it into the Antigravity chat, or let Antigravity read this file directly.\\n\\n\` +
        \`---\\n\\n\` +
        \`\${unifiedPrompt}\\n\`;

    try {
        fs.writeFileSync(promptPath, fileContent, 'utf-8');
        TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Auto-generated fix prompt written to \${promptPath}\`);
    } catch (err) {
        TaintFlowState.outputChannel.appendLine(\`TaintFlow+: Failed to write auto-generated fix prompt: \${err}\`);
    }
}
`,
  'scanners/index.ts': `
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { TaintFlowState } from '../state';
import { updateDiagnostics } from '../diagnostics';
import { updateStatusBar } from '../statusbar';
import { showSummaryNotification } from '../notifications';
import { updateAutoFixPromptFile } from '../antigravity';

// Ensure the helper function is exported for text changes
export function isSupportedDocument(document: vscode.TextDocument): boolean {
    const supportedLanguages = [
        'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
        'java', 'python', 'sql', 'php', 'go', 'rust', 'ruby', 'json', 'csharp', 'html'
    ];
    if (supportedLanguages.includes(document.languageId)) {
        return true;
    }
    const ext = path.extname(document.fileName).toLowerCase();
    const supportedExts = ['.js', '.ts', '.jsx', '.tsx', '.java', '.py', '.sql', '.php', '.go', '.rs', '.rb', '.json', '.cs', '.html', '.htm'];
    return supportedExts.includes(ext);
}

export async function verifyDocument(document: vscode.TextDocument, isManual: boolean = false, isBatch: boolean = false) {
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') return;
    if (!isSupportedDocument(document)) return;
    
    const key = document.uri.toString();
    if (TaintFlowState.activeVerifications.get(key)) return;
    TaintFlowState.activeVerifications.set(key, true);

    try {
        let progressMessage: vscode.Disposable | undefined;
        if (isManual && !isBatch) {
            progressMessage = vscode.window.setStatusBarMessage(\`$(sync~spin) TaintFlow+: Analyzing \${path.basename(document.fileName)}...\`);
        }

        const code = document.getText();
        const findings = await TaintFlowState.engine.analyzeCode(code, document.fileName, document.languageId);
        
        TaintFlowState.findingsCache.set(key, findings);
        updateDiagnostics(document, findings);
        updateStatusBar();
        TaintFlowState.onFindingsChanged.fire();

        await updateAutoFixPromptFile();

        if (progressMessage) progressMessage.dispose();
        
        if (isManual && !isBatch) {
            showSummaryNotification(findings.length, 1);
        }

    } catch (err: any) {
        TaintFlowState.outputChannel.appendLine(\`TaintFlow+ Error analyzing \${document.fileName}: \${err}\`);
    } finally {
        TaintFlowState.activeVerifications.delete(key);
    }
}

export async function verifyAllOpenFiles() {
    const openDocs = vscode.workspace.textDocuments.filter(
        doc => (doc.uri.scheme === 'file' || doc.uri.scheme === 'untitled') && isSupportedDocument(doc)
    );
    
    if (openDocs.length === 0) return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "TaintFlow+: Running Full Scan",
        cancellable: false
    }, async (progress) => {
        let count = 0;
        TaintFlowState.findingsCache.clear();
        for (const doc of openDocs) {
            progress.report({ message: \`Analyzing \${path.basename(doc.fileName)}...\`, increment: 100/openDocs.length });
            await verifyDocument(doc, false, true);
            count++;
        }
        
        let totalFindings = 0;
        for (const findings of TaintFlowState.findingsCache.values()) {
            totalFindings += findings.length;
        }
        showSummaryNotification(totalFindings, count);
    });
}
`
};

for (const [filename, content] of Object.entries(files)) {
  const fullPath = path.join(srcDir, filename);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Created ' + fullPath);
}
