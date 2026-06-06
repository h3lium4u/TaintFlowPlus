import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepositoryScanner } from './repository-scanner';
import { ContextGenerator } from './context-generator';
import { GraphifyViewProvider } from './graph-view-provider';

export function registerGraphifyCommands(
    context: vscode.ExtensionContext,
    scanner: RepositoryScanner,
    provider: GraphifyViewProvider
) {
    // Command: Full Workspace Scan
    const scanCmd = vscode.commands.registerCommand('taintflow.graphify.scanWorkspace', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Graphify indexing workspace",
            cancellable: false
        }, async (progress) => {
            await scanner.performFullScan(progress);
        });
        vscode.window.showInformationMessage('Graphify: Repository index generated successfully!');
        provider.updateGraphData();
    });

    // Command: Generate Repository Context
    const generateContextCmd = vscode.commands.registerCommand('taintflow.graphify.generateContext', async () => {
        const memory = scanner.getMemory();
        const summary = ContextGenerator.generateRepositorySummary(memory, 'markdown');
        
        const doc = await vscode.workspace.openTextDocument({
            content: summary,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    });

    // Command: Explain Current File
    const explainFileCmd = vscode.commands.registerCommand('taintflow.graphify.explainFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor open.');
            return;
        }

        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const relPath = path.relative(root, editor.document.uri.fsPath).replace(/\\/g, '/');
        const memory = scanner.getMemory();
        const explanation = ContextGenerator.explainFile(memory, relPath, 'markdown');

        const doc = await vscode.workspace.openTextDocument({
            content: explanation,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    });

    // Command: Explain Architecture
    const explainArchCmd = vscode.commands.registerCommand('taintflow.graphify.explainArchitecture', async () => {
        const memory = scanner.getMemory();
        const arch = ContextGenerator.explainArchitecture(memory, 'markdown');

        const doc = await vscode.workspace.openTextDocument({
            content: arch,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    });

    // Command: Copy AI Context
    const copyAIContextCmd = vscode.commands.registerCommand('taintflow.graphify.copyAIContext', async () => {
        const memory = scanner.getMemory();
        const aiContext = ContextGenerator.generateAIContext(memory);
        await vscode.env.clipboard.writeText(aiContext);
        vscode.window.showInformationMessage('Graphify: AI context summary copied to clipboard!');
    });

    // Command: Copy Repo Map Data
    const copyRepoMapCmd = vscode.commands.registerCommand('taintflow.graphify.copyRepoMap', async () => {
        const memory = scanner.getMemory();
        await vscode.env.clipboard.writeText(JSON.stringify(memory, null, 2));
        vscode.window.showInformationMessage('Graphify: Repository Map data copied to clipboard!');
    });

    // Command: Export Context
    const exportContextCmd = vscode.commands.registerCommand('taintflow.graphify.exportContext', async () => {
        const memory = scanner.getMemory();
        const summary = ContextGenerator.generateRepositorySummary(memory, 'markdown');
        
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'graphify-context.md')),
            filters: { 'Markdown': ['md'], 'JSON': ['json'] }
        });

        if (uri) {
            const format = uri.fsPath.endsWith('.json') ? 'json' : 'markdown';
            const content = format === 'json' 
                ? JSON.stringify(memory, null, 2)
                : summary;
            
            fs.writeFileSync(uri.fsPath, content, 'utf-8');
            vscode.window.showInformationMessage(`Graphify context successfully exported to: ${path.basename(uri.fsPath)}`);
        }
    });

    // Command: Export Architecture Summary
    const exportArchCmd = vscode.commands.registerCommand('taintflow.graphify.exportArchitecture', async () => {
        const memory = scanner.getMemory();
        const arch = ContextGenerator.explainArchitecture(memory, 'markdown');

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'architecture-summary.md')),
            filters: { 'Markdown': ['md'] }
        });

        if (uri) {
            fs.writeFileSync(uri.fsPath, arch, 'utf-8');
            vscode.window.showInformationMessage(`Architecture summary exported successfully!`);
        }
    });

    // Command: Open Graphify in Full Screen
    const openFullScreenCmd = vscode.commands.registerCommand('taintflow.graphify.openFullScreen', () => {
        provider.openFullScreen();
    });

    context.subscriptions.push(
        scanCmd,
        generateContextCmd,
        explainFileCmd,
        explainArchCmd,
        copyAIContextCmd,
        copyRepoMapCmd,
        exportContextCmd,
        exportArchCmd,
        openFullScreenCmd
    );
}
