
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
        super(`Dashboard Summary`, vscode.TreeItemCollapsibleState.None);
        this.description = `${total} Issues`;
        this.tooltip = `Critical: ${critical}\nHigh: ${high}\nMedium: ${medium}\nLow: ${low}`;
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
        super(`${label} (${count})`, collapsibleState);
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
        this.description = `${findings.length} issues`;
        this.resourceUri = uri;
        this.iconPath = vscode.ThemeIcon.File;
    }
}

export class FindingItem extends vscode.TreeItem {
    constructor(
        public readonly finding: Finding,
        public readonly uri: vscode.Uri
    ) {
        super(`Line ${finding.lineStart}: ${finding.message}`, vscode.TreeItemCollapsibleState.None);
        this.description = finding.source;
        this.tooltip = finding.message;
        
        // Command to open file at line
        this.command = {
            command: 'taintflow.openFile',
            title: 'Open File',
            arguments: [this.uri, finding.lineStart, finding]
        };
        
        this.contextValue = 'findingItem'; // Used for inline action buttons
    }
}
