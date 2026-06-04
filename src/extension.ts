import * as vscode from 'vscode';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import { VeriBuildEngine, Finding } from './veribuild-core';

let watcher: chokidar.FSWatcher | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let outputChannel: vscode.OutputChannel;
let engine: VeriBuildEngine;
const debounceTimers = new Map<string, NodeJS.Timeout>();

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("VeriBuild");
    outputChannel.appendLine("VeriBuild extension activating...");

    // Check workspace trust
    if (!vscode.workspace.isTrusted) {
        outputChannel.appendLine("Workspace is not trusted. Requesting trust...");
        const trusted = await requestWorkspaceTrust();
        if (!trusted) {
            outputChannel.appendLine("Workspace trust denied. Activation aborted.");
            return;
        }
    }

    // Initialize the diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('veribuild');
    context.subscriptions.push(diagnosticCollection);

    // Initialize VeriBuildEngine
    engine = new VeriBuildEngine(context, outputChannel);
    await engine.initialize();

    // Set up chokidar file watcher
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const pathsToWatch = workspaceFolders.map(folder => folder.uri.fsPath);
        watcher = chokidar.watch(pathsToWatch, {
            ignored: [
                /(^|[/\\])\../, // ignore dotfiles/directories
                /node_modules/,
                /dist/,
                /\.git/
            ],
            persistent: true,
            ignoreInitial: true
        });

        watcher.on('change', (filePath) => {
            handleFileChange(filePath);
        });

        watcher.on('add', (filePath) => {
            handleFileChange(filePath);
        });

        outputChannel.appendLine(`Watching workspaces: ${pathsToWatch.join(', ')}`);
    } else {
        outputChannel.appendLine("No workspace folders found to watch.");
    }

    // Register manual verification command
    const verifyCommand = vscode.commands.registerCommand('veribuild.verifyCurrentFile', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage("No active editor found to verify.");
            return;
        }

        const document = activeEditor.document;
        const filePath = document.uri.fsPath;
        outputChannel.appendLine(`Manually verifying: ${filePath}`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VeriBuild: Analyzing code...",
            cancellable: false
        }, async () => {
            try {
                const content = document.getText();
                const findings = await engine.analyzeCode(content, filePath);
                await showDiagnosticsForFile(filePath, findings);
                vscode.window.showInformationMessage(`VeriBuild: Verification complete. Found ${findings.length} issues.`);
            } catch (err) {
                vscode.window.showErrorMessage(`VeriBuild: Verification failed: ${err}`);
            }
        });
    });

    context.subscriptions.push(verifyCommand);
    outputChannel.appendLine("VeriBuild extension activated successfully.");
}

export async function deactivate() {
    if (watcher) {
        await watcher.close();
        watcher = undefined;
    }
    for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
    }
    debounceTimers.clear();
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}

function handleFileChange(filePath: string) {
    if (debounceTimers.has(filePath)) {
        clearTimeout(debounceTimers.get(filePath)!);
    }

    const timer = setTimeout(async () => {
        debounceTimers.delete(filePath);
        try {
            outputChannel.appendLine(`File change detected: ${filePath}. Analyzing...`);
            const content = await fs.promises.readFile(filePath, 'utf8');
            const findings = await engine.analyzeCode(content, filePath);
            await showDiagnosticsForFile(filePath, findings);
        } catch (err) {
            outputChannel.appendLine(`Error reading or analyzing file ${filePath}: ${err}`);
        }
    }, 500);

    debounceTimers.set(filePath, timer);
}

async function showDiagnosticsForFile(filePath: string, findings: Finding[]) {
    const uri = vscode.Uri.file(filePath);
    diagnosticCollection.delete(uri);

    const diagnostics: vscode.Diagnostic[] = [];

    for (const finding of findings) {
        let severity = vscode.DiagnosticSeverity.Information;
        if (finding.severity === 'critical' || finding.severity === 'high') {
            severity = vscode.DiagnosticSeverity.Error;
        } else if (finding.severity === 'medium') {
            severity = vscode.DiagnosticSeverity.Warning;
        } else if (finding.severity === 'low') {
            severity = vscode.DiagnosticSeverity.Information;
        }

        const startLine = Math.max(0, finding.lineStart - 1);
        const endLine = Math.max(0, finding.lineEnd - 1);
        const range = new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);

        const diagnostic = new vscode.Diagnostic(range, finding.message, severity);
        diagnostic.source = `VeriBuild (${finding.source})`;
        diagnostic.code = finding.confidence;

        diagnostics.push(diagnostic);

        // Show a notification with a "Fix" button for high/critical findings if a suggested fix is provided
        if ((finding.severity === 'critical' || finding.severity === 'high') && finding.suggestedFix) {
            showFixNotification(filePath, finding);
        }
    }

    diagnosticCollection.set(uri, diagnostics);
}

async function requestWorkspaceTrust(): Promise<boolean> {
    const ws = vscode.workspace as any;
    if (typeof ws.requestWorkspaceTrust === 'function') {
        return await ws.requestWorkspaceTrust();
    }
    await vscode.commands.executeCommand('workbench.action.requestTrustWorkspace');
    return vscode.workspace.isTrusted;
}

async function showFixNotification(filePath: string, finding: Finding) {
    const action = await vscode.window.showErrorMessage(
        `VeriBuild: ${finding.message} (Line ${finding.lineStart})`,
        'Fix'
    );

    if (action === 'Fix' && finding.suggestedFix) {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const edit = new vscode.WorkspaceEdit();

            const startLine = Math.max(0, finding.lineStart - 1);
            const endLine = Math.max(0, finding.lineEnd - 1);

            const range = new vscode.Range(
                startLine,
                0,
                endLine,
                document.lineAt(endLine).text.length
            );

            edit.replace(document.uri, range, finding.suggestedFix);
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                vscode.window.showInformationMessage("VeriBuild: Suggested fix applied successfully.");
            } else {
                vscode.window.showErrorMessage("VeriBuild: Failed to apply suggested fix.");
            }
        } catch (err) {
            vscode.window.showErrorMessage(`VeriBuild: Error applying fix: ${err}`);
        }
    }
}
