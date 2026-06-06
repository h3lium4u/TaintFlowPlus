import * as vscode from 'vscode';

export function getWebviewContent(
    googleKey: string,
    groqKey: string,
    anthropicKey: string,
    currentMode: string,
    activeModel: string,
    ollamaStatus: boolean,
    autoVerifyEnabled: boolean,
    notificationToastsEnabled: boolean,
    localModel: string = 'auto',
    ollamaModels: string[] = []
): string {
    const hasGoogle = !!googleKey;
    const hasGroq = !!groqKey;
    const hasAnthropic = !!anthropicKey;

    const googleBadge = hasGoogle ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-warning">Missing</span>';
    const groqBadge = hasGroq ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-warning">Missing</span>';
    const anthropicBadge = hasAnthropic ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-warning">Missing</span>';
    
    const modeAutoSelected = currentMode === 'auto' ? 'selected' : '';
    const modeApiSelected = currentMode === 'api' ? 'selected' : '';
    const modeLocalSelected = currentMode === 'local' ? 'selected' : '';

    const ollamaBadge = ollamaStatus 
        ? '<span class="status-indicator status-online"></span> Running' 
        : '<span class="status-indicator status-offline"></span> Not Running';

    const autoVerifyChecked = autoVerifyEnabled ? 'checked' : '';
    const notificationToastsChecked = notificationToastsEnabled ? 'checked' : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaintFlow+ Settings</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e1e);
            --card-bg: var(--vscode-sideBar-background, #252526);
            --border-color: var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            --text-primary: var(--vscode-editor-foreground, #f3f4f6);
            --text-secondary: var(--vscode-descriptionForeground, #9ca3af);
            --accent-primary: var(--vscode-button-background, #0e639c);
            --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
            --success: var(--vscode-testing-iconPassed, #10b981);
            --warning: var(--vscode-testing-iconQueued, #f59e0b);
            --danger: var(--vscode-testing-iconFailed, #ef4444);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            background-color: var(--bg-color);
            color: var(--text-primary);
            padding: 2rem;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }

        .container {
            width: 100%;
            max-width: 640px;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        header {
            text-align: left;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1rem;
        }

        header h1 {
            font-size: 1.6rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 0.25rem;
            letter-spacing: -0.01em;
        }

        header p {
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 400;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            position: relative;
        }

        .section-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }

        label {
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-primary);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .description {
            font-size: 0.8rem;
            color: var(--text-secondary);
            font-weight: 400;
            line-height: 1.4;
        }

        select, input[type="password"], input[type="text"] {
            width: 100%;
            background: var(--vscode-input-background, #2d2d2d);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--vscode-input-foreground, var(--text-primary));
            padding: 0.55rem 0.75rem;
            font-family: inherit;
            font-size: 0.85rem;
            outline: none;
            transition: border-color 0.15s ease;
        }

        select:focus, input:focus {
            border-color: var(--accent-primary);
        }

        .key-input-container {
            position: relative;
            display: flex;
            align-items: center;
        }

        .key-input-container input {
            padding-right: 2.2rem;
        }

        .eye-icon {
            position: absolute;
            right: 0.75rem;
            cursor: pointer;
            color: var(--text-secondary);
            user-select: none;
            font-size: 0.95rem;
            transition: color 0.15s ease;
        }

        .eye-icon:hover {
            color: var(--text-primary);
        }

        .badge {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        .badge-success {
            background-color: rgba(16, 185, 129, 0.12);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .badge-warning {
            background-color: rgba(245, 158, 11, 0.12);
            color: #f59e0b;
            border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .dashboard-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        .dashboard-stat {
            background: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }

        .stat-label {
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        .stat-value {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-online {
            background-color: var(--success);
            box-shadow: 0 0 6px var(--success);
        }

        .status-offline {
            background-color: var(--danger);
            box-shadow: 0 0 6px var(--danger);
        }

        .toggle-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem;
        }

        .toggle-text {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 22px;
            flex-shrink: 0;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-settings-checkboxBackground, #3c3c3c);
            transition: .2s ease;
            border-radius: 22px;
            border: 1px solid var(--border-color);
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: var(--vscode-settings-checkboxForeground, #ffffff);
            transition: .2s ease;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--accent-primary);
        }

        input:checked + .slider:before {
            transform: translateX(18px);
        }

        .btn {
            background: var(--accent-primary);
            color: var(--vscode-button-foreground, #ffffff);
            border: none;
            border-radius: 4px;
            padding: 0.65rem 1.2rem;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease;
            text-align: center;
        }

        .btn:hover {
            background: var(--accent-hover);
        }

        .btn-outline {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-primary);
        }

        .btn-outline:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.05));
        }

        .action-row {
            display: flex;
            gap: 0.75rem;
            margin-top: 0.5rem;
        }

        .toast {
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--vscode-notifications-background, var(--vscode-sideBar-background, #252526));
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            padding: 0.6rem 1.5rem;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transition: transform 0.3s ease;
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>TaintFlow+ Dashboard</h1>
            <p>Secure Static & AI-Powered Security Code Analyzer</p>
        </header>

        <!-- System Status Dashboard -->
        <div class="card">
            <h2 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                System Status
            </h2>
            <div class="dashboard-row">
                <div class="dashboard-stat">
                    <span class="stat-label">Active Model</span>
                    <span class="stat-value" id="activeModelVal">${activeModel}</span>
                </div>
                <div class="dashboard-stat">
                    <span class="stat-label">Ollama (Local LLM)</span>
                    <span class="stat-value" id="ollamaStatusVal">${ollamaBadge}</span>
                </div>
            </div>

            <!-- Auto Verify Toggle -->
            <div class="toggle-container">
                <div class="toggle-text">
                    <span style="font-weight: 500; font-size: 0.85rem;">Auto-Verify on Action</span>
                    <span class="description">Automatically verify files on Save, Open, and Paste.</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="autoVerifyToggle" ${autoVerifyChecked}>
                    <span class="slider"></span>
                </label>
            </div>

            <!-- Warning Popups Toggle -->
            <div class="toggle-container" style="margin-top: 0.75rem;">
                <div class="toggle-text">
                    <span style="font-weight: 500; font-size: 0.85rem;">Warning Popups (Notification Toasts)</span>
                    <span class="description">Show a toast popup when security risks are detected.</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="notificationToastsToggle" ${notificationToastsChecked}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Engine & Provider Configuration -->
        <div class="card">
            <h2 class="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                Configuration Settings
            </h2>

            <!-- Execution Mode Select -->
            <div class="form-group">
                <label for="executionMode">LLM Execution Mode</label>
                <select id="executionMode">
                    <option value="auto" ${modeAutoSelected}>Auto (Hybrid Mode)</option>
                    <option value="api" ${modeApiSelected}>API Models Only</option>
                    <option value="local" ${modeLocalSelected}>Local LLM Only (Ollama)</option>
                </select>
                <span class="description" id="modeDescription">
                    Auto tries API models first and falls back to Ollama if down. API Only disables local backup. Local LLM disables API.
                </span>
            </div>

            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 0.25rem 0;">

            <!-- Local LLM Model -->
            <div class="form-group local-llm-group">
                <label for="localModel">Local LLM Model (Ollama)</label>
                <select id="localModel">
                    <option value="auto" ${localModel === 'auto' ? 'selected' : ''}>Auto-detect Best Model</option>
                    ${ollamaModels.map(m => `<option value="${m}" ${localModel === m ? 'selected' : ''}>${m}</option>`).join('')}
                    ${localModel !== 'auto' && !ollamaModels.includes(localModel) ? `<option value="${localModel}" selected>${localModel} (Not found locally)</option>` : ''}
                </select>
                <span class="description">Select the specific Ollama model to use for analysis.</span>
            </div>

            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 0.25rem 0;">

            <!-- Google Gemini Key -->
            <div class="form-group api-key-group">
                <label for="googleKey">Google Gemini API Key ${googleBadge}</label>
                <div class="key-input-container">
                    <input type="password" id="googleKey" placeholder="Paste Google Gemini API Key..." value="${googleKey.replace(/"/g, '&quot;')}">
                    <span class="eye-icon" onclick="toggleVisibility('googleKey')">👁️</span>
                </div>
            </div>

            <!-- Groq Key -->
            <div class="form-group api-key-group">
                <label for="groqKey">Groq API Key ${groqBadge}</label>
                <div class="key-input-container">
                    <input type="password" id="groqKey" placeholder="Paste Groq API Key..." value="${groqKey.replace(/"/g, '&quot;')}">
                    <span class="eye-icon" onclick="toggleVisibility('groqKey')">👁️</span>
                </div>
            </div>

            <!-- Anthropic Key -->
            <div class="form-group api-key-group">
                <label for="anthropicKey">Anthropic Claude API Key ${anthropicBadge}</label>
                <div class="key-input-container">
                    <input type="password" id="anthropicKey" placeholder="Paste Anthropic API Key..." value="${anthropicKey.replace(/"/g, '&quot;')}">
                    <span class="eye-icon" onclick="toggleVisibility('anthropicKey')">👁️</span>
                </div>
            </div>

            <div class="action-row">
                <button class="btn" onclick="saveSettings()" style="flex: 2;">Save Configuration</button>
                <button class="btn btn-outline" onclick="refreshStatus()" style="flex: 1;">Refresh Status</button>
            </div>
        </div>
    </div>

    <!-- Success Toast Notification -->
    <div id="toast" class="toast">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <span id="toastMessage">Settings Saved!</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function toggleVisibility(id) {
            const input = document.getElementById(id);
            const icon = input.nextElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                icon.innerText = '🙈';
            } else {
                input.type = 'password';
                icon.innerText = '👁️';
            }
        }

        const modeSelect = document.getElementById('executionMode');
        const modeDesc = document.getElementById('modeDescription');
        
        const descMap = {
            'auto': 'Hybrid Mode: Tries Google, Groq, or Anthropic APIs first. Automatically falls back to Ollama if API limit/connection fails.',
            'api': 'API Models Only: Strictly uses cloud APIs (Gemini, Llama/Groq, Claude). No local Ollama fallback is attempted.',
            'local': 'Local LLM Only: Uses Ollama (running locally at localhost:11434) for analysis. Never makes external API calls.'
        };

        modeSelect.addEventListener('change', () => {
            modeDesc.innerText = descMap[modeSelect.value];
            updateApiKeyVisibility();
        });

        function updateApiKeyVisibility() {
            const groups = document.querySelectorAll('.api-key-group');
            const localGroup = document.querySelector('.local-llm-group');
            if (modeSelect.value === 'local') {
                groups.forEach(g => g.style.opacity = '0.35');
                if (localGroup) localGroup.style.opacity = '1';
            } else if (modeSelect.value === 'api') {
                groups.forEach(g => g.style.opacity = '1');
                if (localGroup) localGroup.style.opacity = '0.35';
            } else {
                groups.forEach(g => g.style.opacity = '1');
                if (localGroup) localGroup.style.opacity = '1';
            }
        }

        // Run initially
        updateApiKeyVisibility();

        function saveSettings() {
            const mode = document.getElementById('executionMode').value;
            const googleKey = document.getElementById('googleKey').value;
            const groqKey = document.getElementById('groqKey').value;
            const anthropicKey = document.getElementById('anthropicKey').value;
            const autoVerify = document.getElementById('autoVerifyToggle').checked;
            const enableNotificationToasts = document.getElementById('notificationToastsToggle').checked;
            const localModel = document.getElementById('localModel') ? document.getElementById('localModel').value : 'auto';

            vscode.postMessage({
                command: 'saveSettings',
                mode: mode,
                localModel: localModel,
                googleKey: googleKey,
                groqKey: groqKey,
                anthropicKey: anthropicKey,
                autoVerify: autoVerify,
                enableNotificationToasts: enableNotificationToasts
            });
        }

        function refreshStatus() {
            vscode.postMessage({ command: 'refreshStatus' });
        }

        // Listen for messages from VS Code extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'saved') {
                showToast("Configuration saved successfully!");
                if (message.activeModel) {
                    document.getElementById('activeModelVal').innerText = message.activeModel;
                }
            } else if (message.command === 'statusRefreshed') {
                showToast("System status refreshed!");
                if (message.activeModel) {
                    document.getElementById('activeModelVal').innerText = message.activeModel;
                }
                const ollamaBadge = message.ollamaAvailable 
                    ? '<span class="status-indicator status-online"></span> Running' 
                    : '<span class="status-indicator status-offline"></span> Not Running';
                document.getElementById('ollamaStatusVal').innerHTML = ollamaBadge;
            }
        });

        function showToast(text) {
            const toast = document.getElementById('toast');
            document.getElementById('toastMessage').innerText = text;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    </script>
</body>
</html>`;
}

