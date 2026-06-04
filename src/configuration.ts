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
        await context.secrets.store('veribuild.groq.api_key', apiKey.trim());
        vscode.window.showInformationMessage("VeriBuild: Groq API Key saved successfully.");
    } catch (err) {
        vscode.window.showErrorMessage(`VeriBuild: Failed to save Groq API Key: ${err}`);
    }
}
