
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TaintFlowState } from '../state';
import { FindingItem } from '../sidebar/TaintFlowProvider';
import { generateAndShowFixPrompt } from '../antigravity';
import { verifyDocument, verifyAllOpenFiles } from '../scanners';
import { configureGroq, configureGoogle, configureAnthropic } from '../configuration';
import { getWebviewContent } from '../settings-webview';
import { updateStatusBar } from '../statusbar';

export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('taintflow.openFile', async (uri: vscode.Uri, line: number, finding?: any) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(Math.max(0, line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

            // Highlight attack path in Graphify View
            try {
                if (TaintFlowState.scanner && TaintFlowState.graphifyProvider) {
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (root) {
                        const relPath = path.relative(root, uri.fsPath).replace(/\\/g, '/');
                        const memory = TaintFlowState.scanner.getMemory();
                        const { SecurityFlowAnalyzer } = require('../graphify/security-flow');
                        
                        const vulnType = finding ? finding.message : 'Potential Risk';
                        const severity = finding ? finding.severity : 'high';
                        
                        const attackPath = SecurityFlowAnalyzer.traceAttackPath(
                            memory,
                            relPath,
                            vulnType,
                            severity,
                            line
                        );

                        const steps = attackPath.steps.map((s: any) => s.file);
                        TaintFlowState.graphifyProvider.showSecurityPath(relPath, steps);
                    }
                }
            } catch (e) {
                TaintFlowState.outputChannel.appendLine(`Graphify: Failed to highlight security path: ${e}`);
            }
        }),
        vscode.commands.registerCommand('taintflow.sidebar.focus', () => {
            vscode.commands.executeCommand('taintflow.views.dashboard.focus');
        }),
        
        vscode.commands.registerCommand('taintflow.fixFinding', async (item: FindingItem) => {
            const doc = await vscode.workspace.openTextDocument(item.uri);
            await generateAndShowFixPrompt(doc, [item.finding]);
        }),
        
        vscode.commands.registerCommand('taintflow.fixAll', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const rootPath = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
            
            let totalFindingsCount = 0;
            const promptSections: string[] = [];

            for (const [uriStr, findings] of TaintFlowState.findingsCache.entries()) {
                if (findings.length === 0) continue;
                
                const uri = vscode.Uri.parse(uriStr);
                const relativePath = rootPath ? path.relative(rootPath, uri.fsPath) : uri.fsPath;
                
                const findingsText = findings
                    .map(f => `- Line ${f.lineStart}: [${f.severity.toUpperCase()}] ${f.message}`)
                    .join('\n');
                
                promptSections.push(`### File: ${relativePath}\n${findingsText}`);
                totalFindingsCount += findings.length;
            }

            if (totalFindingsCount === 0) {
                vscode.window.showInformationMessage('No vulnerabilities found to fix.');
                return;
            }

            let graphifyContext = '';
            try {
                if (TaintFlowState.scanner) {
                    const memory = TaintFlowState.scanner.getMemory();
                    const aiContext = require('../graphify/context-generator').ContextGenerator.generateAIContext(memory);
                    graphifyContext = `\nRepository Context:\n${aiContext}\n`;
                }
            } catch {}

            const unifiedPrompt = `Hi Antigravity, please fix the following vulnerabilities across the project:${graphifyContext}\n\n` +
                promptSections.join('\n\n') +
                `\n\nPlease update these files to resolve the vulnerabilities securely.`;

            // Write to file if workspace exists
            if (rootPath) {
                const promptPath = path.join(rootPath, 'fix_prompt.md');
                const fileContent = `# Fix Request for Antigravity Agent\n\n` +
                    `This file contains the generated prompt to fix all vulnerabilities in the project.\n` +
                    `You can copy the prompt below and paste it into the Antigravity chat, or let Antigravity read this file directly.\n\n` +
                    `---\n\n` +
                    `${unifiedPrompt}\n`;
                try {
                    fs.writeFileSync(promptPath, fileContent, 'utf-8');
                    TaintFlowState.outputChannel.appendLine(`TaintFlow+: Unified fix prompt written to ${promptPath}`);
                } catch (err) {
                    TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to write unified fix prompt: ${err}`);
                }
            }

            // Copy to clipboard
            await vscode.env.clipboard.writeText(unifiedPrompt);
            vscode.window.showInformationMessage(`TaintFlow+: Unified prompt for all ${totalFindingsCount} findings copied to clipboard! Paste it into Antigravity.`);
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

        vscode.commands.registerCommand('taintflow.enableAutoVerify', async () => {
            const config = vscode.workspace.getConfiguration('taintflow');
            await config.update('autoVerify', true, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('TaintFlow+: Auto-verify has been enabled.');
            updateStatusBar();
        }),

        vscode.commands.registerCommand('taintflow.disableAutoVerify', async () => {
            const config = vscode.workspace.getConfiguration('taintflow');
            await config.update('autoVerify', false, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('TaintFlow+: Auto-verify has been disabled.');
            updateStatusBar();
        }),

        vscode.commands.registerCommand('taintflow.toggleAutoVerify', async () => {
            const config = vscode.workspace.getConfiguration('taintflow');
            const current = config.get<boolean>('autoVerify', true);
            await config.update('autoVerify', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`TaintFlow+: Auto-verify is now ${!current ? 'Enabled 🟢' : 'Disabled ⚫'}`);
            updateStatusBar();
        }),

        vscode.commands.registerCommand('taintflow.applyFix', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('TaintFlow+: No active editor open to apply the fix to.');
                return;
            }

            const clipboardContent = await vscode.env.clipboard.readText();
            if (!clipboardContent || clipboardContent.trim().length === 0) {
                vscode.window.showWarningMessage('TaintFlow+: Clipboard is empty. Copy the fixed code from Antigravity first.');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `TaintFlow+: Overwrite "${path.basename(editor.document.fileName)}" with the fixed code from clipboard?`,
                { modal: true },
                'Yes, Apply Fix',
                'Cancel'
            );

            if (confirm !== 'Yes, Apply Fix') { return; }

            try {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length)
                );
                edit.replace(editor.document.uri, fullRange, clipboardContent);
                await vscode.workspace.applyEdit(edit);
                await editor.document.save();

                await verifyDocument(editor.document, false);

                vscode.window.showInformationMessage(
                    `✅ TaintFlow+: Fix applied and saved to ${path.basename(editor.document.fileName)}. Re-analyzing...`
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(`TaintFlow+: Failed to apply fix: ${err.message || err}`);
            }
        }),
        
        vscode.commands.registerCommand('taintflow.showStatus', async () => {
            if (TaintFlowState.engine) {
                await TaintFlowState.engine.checkOllamaAvailability();
                await TaintFlowState.engine.updateActiveModel();
            }
            updateStatusBar();

            const googleKey = await context.secrets.get('taintflow.google.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('google.apiKey') || '';
            const groqKey = await context.secrets.get('taintflow.groq.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('groq.apiKey') || '';
            const anthropicKey = await context.secrets.get('taintflow.anthropic.api_key') || vscode.workspace.getConfiguration('taintflow').get<string>('anthropic.apiKey') || '';

            const config = vscode.workspace.getConfiguration('taintflow');
            const currentMode = config.get<string>('mode', 'auto');
            const activeModel = TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None';
            const autoVerifyEnabled = config.get<boolean>('autoVerify', true);
            const enableNotificationToasts = config.get<boolean>('enableNotificationToasts', true);
            const ollamaStatus = TaintFlowState.engine ? TaintFlowState.engine.ollamaAvailable : false;
            const localModel = config.get<string>('localModel', 'auto');
            const ollamaModels = TaintFlowState.engine ? TaintFlowState.engine.ollamaModels : [];

            const panel = vscode.window.createWebviewPanel(
                'taintflowSettings',
                'TaintFlow+ Settings',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            panel.webview.html = getWebviewContent(googleKey, groqKey, anthropicKey, currentMode, activeModel, ollamaStatus, autoVerifyEnabled, enableNotificationToasts, localModel, ollamaModels);
            
            panel.webview.onDidReceiveMessage(
                async (message) => {
                    try {
                        if (message.command === 'saveSettings') {
                            // 1. Save Secrets safely
                            try {
                                const cfg = vscode.workspace.getConfiguration('taintflow');
                                if (message.googleKey && message.googleKey.trim() !== '' && message.googleKey !== '••••••••••••••••') {
                                    await context.secrets.store('taintflow.google.api_key', message.googleKey.trim());
                                    await cfg.update('google.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                } else if (!message.googleKey) {
                                    await context.secrets.delete('taintflow.google.api_key');
                                    await cfg.update('google.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                }
                            } catch (secErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error storing/deleting Google key: ${secErr}`);
                            }

                            try {
                                const cfg = vscode.workspace.getConfiguration('taintflow');
                                if (message.groqKey && message.groqKey.trim() !== '' && message.groqKey !== '••••••••••••••••') {
                                    await context.secrets.store('taintflow.groq.api_key', message.groqKey.trim());
                                    await cfg.update('groq.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                } else if (!message.groqKey) {
                                    await context.secrets.delete('taintflow.groq.api_key');
                                    await cfg.update('groq.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                }
                            } catch (secErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error storing/deleting Groq key: ${secErr}`);
                            }

                            try {
                                const cfg = vscode.workspace.getConfiguration('taintflow');
                                if (message.anthropicKey && message.anthropicKey.trim() !== '' && message.anthropicKey !== '••••••••••••••••') {
                                    await context.secrets.store('taintflow.anthropic.api_key', message.anthropicKey.trim());
                                    await cfg.update('anthropic.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                } else if (!message.anthropicKey) {
                                    await context.secrets.delete('taintflow.anthropic.api_key');
                                    await cfg.update('anthropic.apiKey', undefined, vscode.ConfigurationTarget.Global);
                                }
                            } catch (secErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error storing/deleting Anthropic key: ${secErr}`);
                            }

                            // 2. Save workspace configuration
                            try {
                                const cfg = vscode.workspace.getConfiguration('taintflow');
                                await cfg.update('mode', message.mode, vscode.ConfigurationTarget.Global);
                                await cfg.update('localModel', message.localModel, vscode.ConfigurationTarget.Global);
                                await cfg.update('autoVerify', message.autoVerify, vscode.ConfigurationTarget.Global);
                                await cfg.update('enableNotificationToasts', message.enableNotificationToasts, vscode.ConfigurationTarget.Global);
                            } catch (cfgErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error updating workspace configuration: ${cfgErr}`);
                            }

                            // 3. Initialize engine
                            try {
                                if (TaintFlowState.engine) {
                                    await TaintFlowState.engine.initialize();
                                }
                            } catch (engErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error initializing engine: ${engErr}`);
                            }

                            // 4. Update status bar
                            try {
                                updateStatusBar();
                            } catch (sbErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error updating status bar: ${sbErr}`);
                            }

                            // 5. Sync keys to all MCP configurations
                            try {
                                await syncKeysToMcpConfigs(context, message.mode);
                            } catch (syncErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error syncing keys to MCP configurations: ${syncErr}`);
                            }

                            panel.webview.postMessage({ command: 'saved', activeModel: TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None' });
                            vscode.window.showInformationMessage('TaintFlow+: Configuration saved and synchronized successfully!');

                        } else if (message.command === 'refreshStatus') {
                            // 1. Refresh Ollama and Active Model
                            try {
                                if (TaintFlowState.engine) {
                                    await TaintFlowState.engine.checkOllamaAvailability();
                                    await TaintFlowState.engine.updateActiveModel();
                                }
                            } catch (refErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error checking Ollama availability/active model: ${refErr}`);
                            }

                            // 2. Update status bar
                            try {
                                updateStatusBar();
                            } catch (sbErr) {
                                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Error updating status bar: ${sbErr}`);
                            }
                            
                            panel.webview.postMessage({
                                command: 'statusRefreshed',
                                activeModel: TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None',
                                ollamaAvailable: TaintFlowState.engine ? TaintFlowState.engine.ollamaAvailable : false
                            });
                        }
                    } catch (globalErr) {
                        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Global error in settings panel webview message handler: ${globalErr}`);
                        vscode.window.showErrorMessage(`TaintFlow+ Settings: An unexpected error occurred: ${globalErr}`);
                        
                        // Force unfreeze the buttons in webview by posting a response back
                        try {
                            if (message.command === 'saveSettings') {
                                panel.webview.postMessage({ command: 'saved', activeModel: TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None' });
                            } else if (message.command === 'refreshStatus') {
                                panel.webview.postMessage({
                                    command: 'statusRefreshed',
                                    activeModel: TaintFlowState.engine ? TaintFlowState.engine.activeModel : 'None',
                                    ollamaAvailable: TaintFlowState.engine ? TaintFlowState.engine.ollamaAvailable : false
                                });
                            }
                        } catch (postErr) {
                            // Ignore
                        }
                    }
                },
                undefined,
                context.subscriptions
            );
        })
    );
}

async function syncKeysToMcpConfigs(context: vscode.ExtensionContext, mode: string) {
    try {
        const providers = ['google', 'groq', 'anthropic'];
        const envKeys: Record<string, string> = {};
        for (const p of providers) {
            let key = await context.secrets.get(`taintflow.${p}.api_key`);
            if (!key) {
                const config = vscode.workspace.getConfiguration('taintflow');
                key = config.get<string>(`${p}.apiKey`);
            }
            if (key && key.trim()) {
                envKeys[p.toUpperCase() + '_API_KEY'] = key.trim();
            }
        }

        const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : null;

        const readJson = (filePath: string) => {
            if (!fs.existsSync(filePath)) return {};
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch {
                return {};
            }
        };

        const writeJson = (filePath: string, data: any) => {
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Updated MCP config at ${filePath}`);
            } catch (e) {
                TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to write MCP config at ${filePath}: ${e}`);
            }
        };

        // Construct the environment variables block
        const mcpEnv: Record<string, string> = {
            TAINTFLOW_MODE: mode
        };
        if (envKeys['GROQ_API_KEY']) {
            mcpEnv['GROQ_API_KEY'] = envKeys['GROQ_API_KEY'];
            mcpEnv['TAINTFLOW_GROQ_API_KEY'] = envKeys['GROQ_API_KEY'];
        }
        if (envKeys['GOOGLE_API_KEY']) {
            mcpEnv['GOOGLE_API_KEY'] = envKeys['GOOGLE_API_KEY'];
            mcpEnv['TAINTFLOW_GOOGLE_API_KEY'] = envKeys['GOOGLE_API_KEY'];
        }
        if (envKeys['ANTHROPIC_API_KEY']) {
            mcpEnv['ANTHROPIC_API_KEY'] = envKeys['ANTHROPIC_API_KEY'];
            mcpEnv['TAINTFLOW_ANTHROPIC_API_KEY'] = envKeys['ANTHROPIC_API_KEY'];
        }

        const mcpServerJsPath = rootPath
            ? path.join(rootPath, 'mcp-server', 'dist', 'mcp-server', 'index.js').replace(/\\/g, '/')
            : null;

        const mergeMcpEnv = (currentEnv: any, newEnv: any) => {
            const merged = { ...(currentEnv || {}) };
            const keysToRemove = [
                'GROQ_API_KEY', 'TAINTFLOW_GROQ_API_KEY',
                'GOOGLE_API_KEY', 'TAINTFLOW_GOOGLE_API_KEY',
                'ANTHROPIC_API_KEY', 'TAINTFLOW_ANTHROPIC_API_KEY'
            ];
            for (const key of keysToRemove) {
                delete merged[key];
            }
            return { ...merged, ...newEnv };
        };

        // 1. Antigravity MCP Config
        const antigravityConfigPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
        if (fs.existsSync(path.dirname(antigravityConfigPath))) {
            const config = readJson(antigravityConfigPath);
            if (!config.mcpServers) config.mcpServers = {};
            if (config.mcpServers.taintflow || mcpServerJsPath) {
                if (!config.mcpServers.taintflow) {
                    config.mcpServers.taintflow = {
                        command: 'node',
                        args: [mcpServerJsPath]
                    };
                }
                config.mcpServers.taintflow.env = mergeMcpEnv(config.mcpServers.taintflow.env, mcpEnv);
                writeJson(antigravityConfigPath, config);
            }
        }

        // 2. Cursor Global Config
        const cursorGlobalConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
        if (fs.existsSync(path.dirname(cursorGlobalConfigPath))) {
            const config = readJson(cursorGlobalConfigPath);
            if (!config.mcpServers) config.mcpServers = {};
            if (config.mcpServers.taintflow || mcpServerJsPath) {
                if (!config.mcpServers.taintflow) {
                    config.mcpServers.taintflow = {
                        command: 'node',
                        args: [mcpServerJsPath]
                    };
                }
                config.mcpServers.taintflow.env = mergeMcpEnv(config.mcpServers.taintflow.env, mcpEnv);
                writeJson(cursorGlobalConfigPath, config);
            }
        }

        // 3. Cursor Workspace Config
        if (rootPath) {
            const cursorWsConfigPath = path.join(rootPath, '.cursor', 'mcp.json');
            const config = readJson(cursorWsConfigPath);
            if (!config.mcpServers) config.mcpServers = {};
            if (config.mcpServers.taintflow || mcpServerJsPath) {
                if (!config.mcpServers.taintflow) {
                    config.mcpServers.taintflow = {
                        command: 'node',
                        args: [mcpServerJsPath]
                    };
                }
                config.mcpServers.taintflow.env = mergeMcpEnv(config.mcpServers.taintflow.env, mcpEnv);
                writeJson(cursorWsConfigPath, config);
            }
        }

        // 4. VS Code Workspace Config
        if (rootPath) {
            const vscodeWsConfigPath = path.join(rootPath, '.vscode', 'mcp.json');
            const config = readJson(vscodeWsConfigPath);
            if (!config.servers) config.servers = {};
            if (config.servers.taintflow || mcpServerJsPath) {
                if (!config.servers.taintflow) {
                    config.servers.taintflow = {
                        type: 'stdio',
                        command: 'node',
                        args: [mcpServerJsPath]
                    };
                }
                config.servers.taintflow.env = mergeMcpEnv(config.servers.taintflow.env, mcpEnv);
                writeJson(vscodeWsConfigPath, config);
            }
        }

        // 5. Windsurf Global Config
        const windsurfConfigPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
        if (fs.existsSync(path.dirname(windsurfConfigPath))) {
            const config = readJson(windsurfConfigPath);
            if (!config.mcpServers) config.mcpServers = {};
            if (config.mcpServers.taintflow || mcpServerJsPath) {
                if (!config.mcpServers.taintflow) {
                    config.mcpServers.taintflow = {
                        command: 'node',
                        args: [mcpServerJsPath]
                    };
                }
                config.mcpServers.taintflow.env = mergeMcpEnv(config.mcpServers.taintflow.env, mcpEnv);
                writeJson(windsurfConfigPath, config);
            }
        }
    } catch (err) {
        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Exception in syncKeysToMcpConfigs: ${err}`);
    }
}
