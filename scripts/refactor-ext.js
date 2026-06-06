const fs = require('fs');
const path = require('path');

const srcDir = path.join('d:/TaintFlow+', 'src');

const commandsTs = `
import * as vscode from 'vscode';
import { TaintFlowState } from '../state';
import { FindingItem } from '../sidebar/TaintFlowProvider';
import { generateAndShowFixPrompt } from '../antigravity';
import { verifyDocument, verifyAllOpenFiles } from '../scanners';
import { configureGroq, configureGoogle, configureAnthropic } from '../configuration';
import { getWebviewContent } from '../settings-webview';

export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('taintflow.openFile', async (uri: vscode.Uri, line: number) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(Math.max(0, line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }),
        
        vscode.commands.registerCommand('taintflow.fixFinding', async (item: FindingItem) => {
            const doc = await vscode.workspace.openTextDocument(item.uri);
            await generateAndShowFixPrompt(doc, [item.finding]);
        }),
        
        vscode.commands.registerCommand('taintflow.fixAll', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const findings = TaintFlowState.findingsCache.get(activeEditor.document.uri.toString()) || [];
                if (findings.length > 0) {
                    await generateAndShowFixPrompt(activeEditor.document, findings);
                } else {
                    vscode.window.showInformationMessage('No vulnerabilities to fix in the active file.');
                }
            }
        }),

        vscode.commands.registerCommand('taintflow.verifyCurrentFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await verifyDocument(editor.document, true);
            }
        }),

        vscode.commands.registerCommand('taintflow.verifyAllOpenFiles', async () => {
            await verifyAllOpenFiles();
        }),
        
        vscode.commands.registerCommand('taintflow.configureGroq', async () => {
            await configureGroq(context);
        }),

        vscode.commands.registerCommand('taintflow.configureGoogle', async () => {
            await configureGoogle(context);
        }),

        vscode.commands.registerCommand('taintflow.configureAnthropic', async () => {
            await configureAnthropic(context);
        }),
        
        vscode.commands.registerCommand('taintflow.showStatus', async () => {
            // Reusing existing webview logic
            const googleKey = await context.secrets.get('taintflow.google.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('google.apiKey') || '';
            const groqKey = await context.secrets.get('taintflow.groq.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('groq.apiKey') || '';
            const anthropicKey = await context.secrets.get('taintflow.anthropic.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('anthropic.apiKey') || '';

            const config = vscode.workspace.getConfiguration('taintflow');
            const currentMode = config.get<string>('mode', 'auto');
            const activeModel = TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None';
            const autoVerifyEnabled = config.get<boolean>('autoVerify', true);
            const ollamaStatus = TaintFlowState.engine ? TaintFlowState.engine.ollamaAvailable : false;

            const panel = vscode.window.createWebviewPanel(
                'taintflowSettings',
                'TaintFlow+ Settings',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            panel.webview.html = getWebviewContent(googleKey, groqKey, anthropicKey, currentMode, activeModel, ollamaStatus, autoVerifyEnabled);
            
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    if (message.command === 'saveSettings') {
                        if (message.googleKey && message.googleKey.trim() !== '' && message.googleKey !== '••••••••••••••••') {
                            await context.secrets.store('taintflow.google.api_key', message.googleKey.trim());
                        } else if (!message.googleKey) {
                            await context.secrets.delete('taintflow.google.api_key');
                        }
                        if (message.groqKey && message.groqKey.trim() !== '' && message.groqKey !== '••••••••••••••••') {
                            await context.secrets.store('taintflow.groq.api_key', message.groqKey.trim());
                        } else if (!message.groqKey) {
                            await context.secrets.delete('taintflow.groq.api_key');
                        }
                        if (message.anthropicKey && message.anthropicKey.trim() !== '' && message.anthropicKey !== '••••••••••••••••') {
                            await context.secrets.store('taintflow.anthropic.api_key', message.anthropicKey.trim());
                        } else if (!message.anthropicKey) {
                            await context.secrets.delete('taintflow.anthropic.api_key');
                        }

                        const cfg = vscode.workspace.getConfiguration('taintflow');
                        await cfg.update('mode', message.mode, vscode.ConfigurationTarget.Global);
                        await cfg.update('autoVerify', message.autoVerify, vscode.ConfigurationTarget.Global);

                        if (TaintFlowState.engine) await TaintFlowState.engine.initialize();

                        panel.webview.postMessage({ command: 'saved', activeModel: TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None' });
                        vscode.window.showInformationMessage('TaintFlow+: Configuration saved.');
                    }
                },
                undefined,
                context.subscriptions
            );
        })
    );
}
`;

fs.mkdirSync(path.join(srcDir, 'commands'), { recursive: true });
fs.writeFileSync(path.join(srcDir, 'commands', 'index.ts'), commandsTs, 'utf8');

const extensionTs = `
import * as vscode from 'vscode';
import { TaintFlowEngine } from './taintflow-core';
import { TaintFlowState } from './state';
import { initStatusBar, updateStatusBar } from './statusbar';
import { TaintFlowCodeActionProvider } from './diagnostics';
import { registerCommands } from './commands';
import { TaintFlowSidebarProvider } from './sidebar/TaintFlowProvider';
import { verifyDocument, isSupportedDocument } from './scanners';

export async function activate(context: vscode.ExtensionContext) {
    TaintFlowState.context = context;
    
    TaintFlowState.outputChannel = vscode.window.createOutputChannel('TaintFlow+');
    context.subscriptions.push(TaintFlowState.outputChannel);
    TaintFlowState.outputChannel.appendLine('TaintFlow+: Activating professional dashboard...');

    TaintFlowState.engine = new TaintFlowEngine(context, TaintFlowState.outputChannel);
    TaintFlowState.engine.onModeChange = () => updateStatusBar();

    TaintFlowState.diagnosticCollection = vscode.languages.createDiagnosticCollection('taintflow');
    context.subscriptions.push(TaintFlowState.diagnosticCollection);

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
}

export function deactivate() {
    if (TaintFlowState.engine) {
        TaintFlowState.engine.dispose();
    }
}
`;

fs.writeFileSync(path.join(srcDir, 'extension.ts'), extensionTs, 'utf8');
console.log('Finished refactoring.');
