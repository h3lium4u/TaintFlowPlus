
import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { TaintFlowState } from '../state';
import { updateDiagnostics } from '../diagnostics';
import { updateStatusBar } from '../statusbar';
import { showSummaryNotification, showMinimalistRiskPopup } from '../notifications';
import { updateAutoFixPromptFile } from '../antigravity';

// Ensure the helper function is exported for text changes
export function isSupportedDocument(document: vscode.TextDocument): boolean {
    const supportedLanguages = [
        'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
        'java', 'python', 'sql', 'php', 'go', 'rust', 'ruby', 'json', 'csharp', 'html',
        'r', 'yaml', 'c', 'cpp', 'dockerfile'
    ];
    if (supportedLanguages.includes(document.languageId)) {
        return true;
    }
    const ext = path.extname(document.fileName).toLowerCase();
    const base = path.basename(document.fileName).toLowerCase();
    const supportedExts = [
        '.js', '.ts', '.jsx', '.tsx', '.java', '.py', '.sql', '.php', '.go', '.rs', '.rb', '.json', '.cs', '.html', '.htm',
        '.r', '.rmd', '.yaml', '.yml', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.dockerfile'
    ];
    return supportedExts.includes(ext) || ext === '.dockerfile' || base === 'dockerfile' || base.startsWith('dockerfile.');
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
            progressMessage = vscode.window.setStatusBarMessage(`$(sync~spin) TaintFlow+: Analyzing ${path.basename(document.fileName)}...`);
        }

        const code = document.getText();
        
        // Check previous cache count
        const previousFindings = TaintFlowState.findingsCache.get(key) || [];
        const previousCount = previousFindings.length;

        // Check Ollama status if we depend on it
        const mode = TaintFlowState.engine.getMode();
        if (mode === 'local' || (!(await TaintFlowState.engine.hasConfiguredApi()) && mode === 'auto')) {
            await TaintFlowState.engine.checkOllamaAvailability();
            if (!TaintFlowState.engine.ollamaAvailable) {
                vscode.window.showWarningMessage("TaintFlow+: Local LLM (Ollama) is not running. Please start Ollama or configure API keys to enable AI verification.", "Open Settings").then(selection => {
                    if (selection === "Open Settings") vscode.commands.executeCommand("taintflow.showStatus");
                });
            }
        }

        const findings = await TaintFlowState.engine.analyzeCode(code, document.fileName, document.languageId);
        
        TaintFlowState.findingsCache.set(key, findings);
        updateDiagnostics(document, findings);
        updateStatusBar();
        TaintFlowState.onFindingsChanged.fire();

        await updateAutoFixPromptFile();

        if (progressMessage) progressMessage.dispose();
        
        if (isManual && !isBatch) {
            showSummaryNotification(findings.length, 1);
        } else if (!isManual && findings.length > previousCount) {
            showMinimalistRiskPopup(findings.length, path.basename(document.fileName));
        }

    } catch (err: any) {
        TaintFlowState.outputChannel.appendLine(`TaintFlow+ Error analyzing ${document.fileName}: ${err}`);
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
            progress.report({ message: `Analyzing ${path.basename(doc.fileName)}...`, increment: 100/openDocs.length });
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
