
import * as vscode from 'vscode';

export function showSummaryNotification(totalFindings: number, fileCount: number) {
    if (totalFindings === 0) {
        vscode.window.showInformationMessage(`TaintFlow+ Scan Complete: ✅ No vulnerabilities found.`);
    } else {
        vscode.window.showWarningMessage(
            `TaintFlow+ Scan Complete: Found ${totalFindings} vulnerabilities across ${fileCount} files.`,
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

export function showMinimalistRiskPopup(totalFindings: number, fileName: string) {
    // Only show if user notifications are enabled in settings
    const enableToasts = vscode.workspace.getConfiguration('taintflow').get('enableNotificationToasts', false);
    if (!enableToasts) return;

    vscode.window.showWarningMessage(
        `⚠️ TaintFlow+: ${totalFindings} risk${totalFindings > 1 ? 's' : ''} found in ${fileName}`,
        'Show'
    ).then(selection => {
        if (selection === 'Show') {
            vscode.commands.executeCommand('taintflow.sidebar.focus');
        }
    });
}

