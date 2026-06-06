
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
    if (!statusBarItem) {
        return;
    }
    try {
        const config = vscode.workspace.getConfiguration('taintflow');
        const autoVerify = config.get<boolean>('autoVerify', true);
        const activeModel = TaintFlowState.engine?.activeModel || 'None';
        
        if (!autoVerify) {
            statusBarItem.text = 'TaintFlow+: $(shield) Paused';
            statusBarItem.tooltip = 'TaintFlow+ is paused. Click to open settings.';
            try {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } catch (e) {
                statusBarItem.backgroundColor = undefined;
            }
            statusBarItem.color = undefined;
            statusBarItem.command = 'taintflow.showStatus';
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
            const isOffline = TaintFlowState.engine?.isCurrentlyUsingOllama && !TaintFlowState.engine?.ollamaAvailable;
            if (isOffline) {
                statusBarItem.text = `TaintFlow+: $(shield) Active (${activeModel})`;
                statusBarItem.tooltip = `TaintFlow+ Dashboard | Ollama (Local LLM) is offline! Click to open settings.`;
                try {
                    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                } catch (e) {
                    statusBarItem.backgroundColor = undefined;
                }
                statusBarItem.color = undefined;
                statusBarItem.command = 'taintflow.showStatus';
            } else {
                statusBarItem.text = `TaintFlow+: $(shield) Active (${activeModel})`;
                statusBarItem.tooltip = `TaintFlow+ Dashboard | Active and Clean.`;
                statusBarItem.backgroundColor = undefined;
                try {
                    statusBarItem.color = new vscode.ThemeColor('testing.iconPassed');
                } catch (e) {
                    statusBarItem.color = undefined;
                }
                statusBarItem.command = 'taintflow.sidebar.focus';
            }
        } else if (criticalCount > 0 || highCount > 0) {
            statusBarItem.text = `TaintFlow+: $(shield) Active - ${criticalCount} Critical | ${highCount} High (${activeModel})`;
            statusBarItem.tooltip = `TaintFlow+: Found ${criticalCount} critical and ${highCount} high vulnerabilities! Click to view.`;
            try {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } catch (e) {
                statusBarItem.backgroundColor = undefined;
            }
            statusBarItem.color = undefined;
            statusBarItem.command = 'taintflow.sidebar.focus';
        } else {
            statusBarItem.text = `TaintFlow+: $(shield) Active - ${totalFindings} Issues (${activeModel})`;
            statusBarItem.tooltip = `TaintFlow+: Found ${totalFindings} issues. Click to view.`;
            try {
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } catch (e) {
                statusBarItem.backgroundColor = undefined;
            }
            statusBarItem.color = undefined;
            statusBarItem.command = 'taintflow.sidebar.focus';
        }
        
        statusBarItem.show();
    } catch (err) {
        if (TaintFlowState.outputChannel) {
            TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error updating status bar: ${err}`);
        }
    }
}
