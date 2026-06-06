
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

        const diag = new TaintFlowDiagnostic(range, `[${f.source}] ${f.message}`, severity, f.suggestedFix);
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

                const action = new vscode.CodeAction(`Apply Fix: ${cleanMsg}`, vscode.CodeActionKind.QuickFix);
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
