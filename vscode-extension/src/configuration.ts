import * as vscode from 'vscode';

export async function configureGroq(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Groq API Key",
        placeHolder: "gsk_...",
        password: true,
        ignoreFocusOut: true
    });

    if (apiKey === undefined) {
        // User cancelled the prompt
        return;
    }

    if (!apiKey.trim()) {
        vscode.window.showWarningMessage("Groq API Key cannot be empty.");
        return;
    }

    try {
        await context.secrets.store('taintflow.groq.api_key', apiKey.trim());
        vscode.window.showInformationMessage("TaintFlow+: Groq API Key saved successfully.");
    } catch (err) {
        vscode.window.showErrorMessage(`TaintFlow+: Failed to save Groq API Key: ${err}`);
    }
}

export async function configureGoogle(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Google API Key",
        placeHolder: "AIzaSy...",
        password: true,
        ignoreFocusOut: true
    });

    if (apiKey === undefined) {
        return;
    }

    if (!apiKey.trim()) {
        vscode.window.showWarningMessage("Google API Key cannot be empty.");
        return;
    }

    try {
        await context.secrets.store('taintflow.google.api_key', apiKey.trim());
        vscode.window.showInformationMessage("TaintFlow+: Google API Key saved successfully.");
    } catch (err) {
        vscode.window.showErrorMessage(`TaintFlow+: Failed to save Google API Key: ${err}`);
    }
}

export async function configureOpenAI(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your OpenAI API Key",
        placeHolder: "sk-...",
        password: true,
        ignoreFocusOut: true
    });

    if (apiKey === undefined) {
        return;
    }

    if (!apiKey.trim()) {
        vscode.window.showWarningMessage("OpenAI API Key cannot be empty.");
        return;
    }

    try {
        await context.secrets.store('taintflow.openai.api_key', apiKey.trim());
        vscode.window.showInformationMessage("TaintFlow+: OpenAI API Key saved successfully.");
    } catch (err) {
        vscode.window.showErrorMessage(`TaintFlow+: Failed to save OpenAI API Key: ${err}`);
    }
}

export async function configureAnthropic(context: vscode.ExtensionContext) {
    const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Anthropic API Key",
        placeHolder: "sk-ant-...",
        password: true,
        ignoreFocusOut: true
    });

    if (apiKey === undefined) {
        return;
    }

    if (!apiKey.trim()) {
        vscode.window.showWarningMessage("Anthropic API Key cannot be empty.");
        return;
    }

    try {
        await context.secrets.store('taintflow.anthropic.api_key', apiKey.trim());
        vscode.window.showInformationMessage("TaintFlow+: Anthropic API Key saved successfully.");
    } catch (err) {
        vscode.window.showErrorMessage(`TaintFlow+: Failed to save Anthropic API Key: ${err}`);
    }
}
