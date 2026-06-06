
import * as vscode from 'vscode';
import { TaintFlowEngine } from './taintflow-core';
import { TaintFlowState } from './state';
import { initStatusBar, updateStatusBar } from './statusbar';
import { TaintFlowCodeActionProvider } from './diagnostics';
import { registerCommands } from './commands';
import { TaintFlowSidebarProvider } from './sidebar/TaintFlowProvider';
import { verifyDocument, isSupportedDocument } from './scanners';

// Graphify Imports
import { RepositoryScanner } from './graphify/repository-scanner';
import { GraphifyViewProvider } from './graphify/graph-view-provider';
import { registerGraphifyCommands } from './graphify/graph-commands';

export async function activate(context: vscode.ExtensionContext) {
    TaintFlowState.context = context;
    
    TaintFlowState.outputChannel = vscode.window.createOutputChannel('TaintFlow+');
    context.subscriptions.push(TaintFlowState.outputChannel);
    TaintFlowState.outputChannel.appendLine('TaintFlow+: Activating professional dashboard...');

    TaintFlowState.engine = new TaintFlowEngine(context, TaintFlowState.outputChannel);
    TaintFlowState.engine.onModeChange = () => updateStatusBar();

    TaintFlowState.diagnosticCollection = vscode.languages.createDiagnosticCollection('taintflow');
    context.subscriptions.push(TaintFlowState.diagnosticCollection);

    // Initialize Graphify
    const scanner = new RepositoryScanner();
    TaintFlowState.scanner = scanner;
    scanner.startWatching();
    context.subscriptions.push(new vscode.Disposable(() => scanner.stopWatching()));

    // Synchronize Graphify memory updates to Antigravity
    scanner.onMemoryUpdated(async () => {
        TaintFlowState.outputChannel.appendLine('TaintFlow+: Graphify memory updated. Synchronizing Graphify context...');
        try {
            const { injectGraphifyContextToAntigravity } = require('./commands/index');
            await injectGraphifyContextToAntigravity(context);
        } catch (err) {
            TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to sync memory update: ${err}`);
        }
    });

    // Synchronize MCP on configuration changes or user accounts switching (which modifies config values/secrets)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('taintflow')) {
                TaintFlowState.outputChannel.appendLine('TaintFlow+: Configuration changed. Re-synchronizing MCP and Graphify context...');
                try {
                    const config = vscode.workspace.getConfiguration('taintflow');
                    const mode = config.get<string>('mode', 'auto');
                    const { syncKeysToMcpConfigs } = require('./commands/index');
                    await syncKeysToMcpConfigs(context, mode);
                } catch (err) {
                    TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to sync configuration update: ${err}`);
                }
            }
        })
    );

    const graphifyProvider = new GraphifyViewProvider(context, scanner);
    TaintFlowState.graphifyProvider = graphifyProvider;
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(GraphifyViewProvider.viewType, graphifyProvider)
    );

    registerGraphifyCommands(context, scanner, graphifyProvider);

    // Trigger non-blocking background scan
    setTimeout(() => {
        scanner.performFullScan().catch(err => {
            TaintFlowState.outputChannel.appendLine(`Graphify: Background scan error: ${err}`);
        });
    }, 1000);

    initStatusBar(context);

    TaintFlowState.engine.initialize().then(() => {
        updateStatusBar();
    });

    registerCommands(context);

    // Register Sidebar
    const sidebarProvider = new TaintFlowSidebarProvider();
    vscode.window.registerTreeDataProvider('taintflow.views.dashboard', sidebarProvider);
    
    // Register Quick Fix Provider
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            '*',
            new TaintFlowCodeActionProvider(),
            { providedCodeActionKinds: TaintFlowCodeActionProvider.providedCodeActionKinds }
        )
    );

    // Event Listeners for Auto-Verification
    const debounceTimeouts = new Map<string, NodeJS.Timeout>();

    function debounceVerify(document: vscode.TextDocument) {
        const key = document.uri.toString();
        if (debounceTimeouts.has(key)) clearTimeout(debounceTimeouts.get(key));
        
        debounceTimeouts.set(key, setTimeout(() => {
            debounceTimeouts.delete(key);
            verifyDocument(document, false);
        }, 1500));
    }

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (vscode.workspace.getConfiguration('taintflow').get('autoVerify', true)) {
                verifyDocument(document, false);
            }
        }),
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (vscode.workspace.getConfiguration('taintflow').get('autoVerify', true)) {
                verifyDocument(document, false);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && vscode.workspace.getConfiguration('taintflow').get('autoVerify', true)) {
                verifyDocument(editor.document, false);
            }
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (!vscode.workspace.getConfiguration('taintflow').get('autoVerify', true)) return;
            if (event.contentChanges.length === 0) return;
            debounceVerify(event.document);
        })
    );

    // Startup scan for visible files
    if (vscode.workspace.getConfiguration('taintflow').get('autoVerify', true)) {
        for (const editor of vscode.window.visibleTextEditors) {
            verifyDocument(editor.document, false);
        }
    }

    // Onboarding guide for new users
    setTimeout(() => {
        const hasWelcomed = context.globalState.get<boolean>('taintflow.welcomed', false);
        if (!hasWelcomed) {
            TaintFlowState.engine.hasConfiguredApi().then(async (hasApi) => {
                if (!hasApi) {
                    vscode.window.showInformationMessage(
                        "Welcome to TaintFlow+! To get started, please configure your API keys or review your Local LLM settings.",
                        "Open Configuration Dashboard",
                        "Later"
                    ).then(async (selection) => {
                        if (selection === "Open Configuration Dashboard") {
                            vscode.commands.executeCommand("taintflow.showStatus");
                        }
                        await context.globalState.update('taintflow.welcomed', true);
                    });
                } else {
                    await context.globalState.update('taintflow.welcomed', true);
                }
            });
        }
    }, 3000);
}

export function deactivate() {
    if (TaintFlowState.engine) {
        TaintFlowState.engine.dispose();
    }
}
