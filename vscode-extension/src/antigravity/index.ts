
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Finding } from '../taintflow-core';
import { TaintFlowState } from '../state';

export async function generateAndShowFixPrompt(document: vscode.TextDocument, findings: Finding[]) {
    const relativePath = vscode.workspace.workspaceFolders 
        ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, document.fileName)
        : document.fileName;

    const findingsText = findings.map(f => `- Line ${f.lineStart}: [${f.severity.toUpperCase()}] ${f.message}`).join('\n');
    
    let graphifyContext = '';
    try {
        if (TaintFlowState.scanner) {
            const memory = TaintFlowState.scanner.getMemory();
            const aiContext = require('../graphify/context-generator').ContextGenerator.generateAIContext(memory);
            graphifyContext = `\nRepository Context:\n${aiContext}\n`;
        }
    } catch {}

    const fixPrompt = `Hi Antigravity, please fix the following vulnerabilities in ${relativePath}:${graphifyContext}\n\n${findingsText}\n\nPlease update the file to resolve these issues securely.`;

    await writeAntigravityPrompt(document, fixPrompt);
    
    // Auto-copy to clipboard
    await vscode.env.clipboard.writeText(fixPrompt);
    vscode.window.showInformationMessage('TaintFlow+: Fix prompt copied to clipboard! Paste it into Antigravity.');
}

export async function writeAntigravityPrompt(document: vscode.TextDocument, fixPrompt: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let rootPath: string | undefined;
    if (workspaceFolders && workspaceFolders.length > 0) {
        rootPath = workspaceFolders[0].uri.fsPath;
    } else if (document.uri.scheme === 'file') {
        rootPath = path.dirname(document.fileName);
    }
    if (!rootPath) return;
    const promptPath = path.join(rootPath, 'fix_prompt.md');
    const fileExists = fs.existsSync(promptPath);

    const fileContent = `# Fix Request for Antigravity Agent\n\n` +
        `This file contains the generated prompt to fix vulnerabilities in your code.\n` +
        `You can copy the prompt below and paste it into the Antigravity chat, or let Antigravity read this file directly.\n\n` +
        `---\n\n` +
        `${fixPrompt}\n`;

    try {
        fs.writeFileSync(promptPath, fileContent, 'utf-8');
        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Generated fix prompt written to ${promptPath}`);
        const msg = !fileExists 
            ? "TaintFlow+: Fix prompt document created." 
            : "TaintFlow+: Fix prompt document updated.";
        vscode.window.showInformationMessage(msg, "Open").then(selection => {
            if (selection === "Open") {
                vscode.workspace.openTextDocument(vscode.Uri.file(promptPath)).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            }
        });
    } catch (err) {
        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to write fix prompt: ${err}`);
    }
}

export async function updateAutoFixPromptFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let rootPath: string | undefined;
    if (workspaceFolders && workspaceFolders.length > 0) {
        rootPath = workspaceFolders[0].uri.fsPath;
    } else {
        // Fallback: look for a file on disk in findingsCache to use its directory
        for (const uriStr of TaintFlowState.findingsCache.keys()) {
            const uri = vscode.Uri.parse(uriStr);
            if (uri.scheme === 'file') {
                rootPath = path.dirname(uri.fsPath);
                break;
            }
        }
        // If still not found, check the active text editor
        if (!rootPath) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.uri.scheme === 'file') {
                rootPath = path.dirname(activeEditor.document.fileName);
            }
        }
    }

    if (!rootPath) return;
    const promptPath = path.join(rootPath, 'fix_prompt.md');
    const fileExists = fs.existsSync(promptPath);
    let previousContent = '';
    if (fileExists) {
        try {
            previousContent = fs.readFileSync(promptPath, 'utf-8');
        } catch {}
    }

    let totalFindingsCount = 0;
    const promptSections: string[] = [];

    for (const [uriStr, findings] of TaintFlowState.findingsCache.entries()) {
        if (findings.length === 0) continue;
        
        const uri = vscode.Uri.parse(uriStr);
        const relativePath = uri.scheme === 'file' 
            ? path.relative(rootPath, uri.fsPath).replace(/\\/g, '/')
            : uri.fsPath;
        
        const findingsText = findings
            .map(f => `- Line ${f.lineStart}: [${f.severity.toUpperCase()}] ${f.message}`)
            .join('\n');
        
        promptSections.push(`### File: ${relativePath}\n${findingsText}`);
        totalFindingsCount += findings.length;
    }

    if (totalFindingsCount === 0) {
        try {
            fs.writeFileSync(promptPath, '', 'utf-8');
            TaintFlowState.outputChannel.appendLine(`TaintFlow+: Cleared fix_prompt.md because no risks are present.`);
            
            // Notification should always come
            vscode.window.showInformationMessage("TaintFlow+: No vulnerabilities found. The fix prompt document is empty.", "Open").then(selection => {
                if (selection === "Open") {
                    vscode.workspace.openTextDocument(vscode.Uri.file(promptPath)).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
        } catch (err) {
            TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to clear/create empty fix_prompt.md: ${err}`);
        }
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

    const fileContent = `# Fix Request for Antigravity Agent\n\n` +
        `This file contains the generated prompt to fix all vulnerabilities in the project.\n` +
        `You can copy the prompt below and paste it into the Antigravity chat, or let Antigravity read this file directly.\n\n` +
        `---\n\n` +
        `${unifiedPrompt}\n`;

    try {
        fs.writeFileSync(promptPath, fileContent, 'utf-8');
        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Auto-generated fix prompt written to ${promptPath}`);
        
        const msg = !fileExists
            ? "TaintFlow+: Fix prompt document created."
            : (previousContent !== fileContent ? "TaintFlow+: Fix prompt document updated." : undefined);
            
        if (msg) {
            vscode.window.showInformationMessage(msg, "Open").then(selection => {
                if (selection === "Open") {
                    vscode.workspace.openTextDocument(vscode.Uri.file(promptPath)).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
        }
    } catch (err) {
        TaintFlowState.outputChannel.appendLine(`TaintFlow+: Failed to write auto-generated fix prompt: ${err}`);
    }
}
