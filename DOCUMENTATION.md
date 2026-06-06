# TaintFlow+ Documentation

This guide provides a focused overview of the **TaintFlow+** project, configuration settings, development/build implementation steps, usage instructions, and current version details.

---

## 1. About the Project

**TaintFlow+** is a real-time, hybrid security verification and repository intelligence suite designed for IDEs. It automatically verifies source code safety as you edit, paste, or save, combining static analysis and artificial intelligence (Local LLMs and Cloud AI providers) to detect and triage vulnerabilities, secrets, SQL injections, and other critical risks.

### Key Features
*   **Static Scanner**: Instant heuristics-based scanning for 14+ languages.
*   **Hybrid AI Core**: Offloads deep security checks to local models (via Ollama) or cloud providers (Gemini, Groq).
*   **Graphify & Neural Flow**: Generates interactive visualizations of file dependencies, database interactions, external service boundaries, and security findings.
*   **Interactive Taint Paths**: Visualizes how untrusted data propagates from sources to vulnerable sinks.
*   **Auto-Fix Recommendations**: Offers inline IDE suggestions to replace vulnerable code with secure alternatives.

---

## 2. Version Information

*   **Current Stable Version**: `1.0.1`
*   **Extension ID**: `f1zz4n.taintflow-plus`
*   **Publisher ID**: `F1ZZ4N`
*   **License**: `MIT`

---

## 3. Configuration Settings

TaintFlow+ is configured through the IDE settings (`Ctrl+,` or `Cmd+,`). Below are the primary configuration options:

| Setting Key | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `taintflow.autoVerify` | `boolean` | `true` | Automatically triggers analysis when files are opened, edited, or saved. |
| `taintflow.enableNotificationToasts` | `boolean` | `true` | Triggers alert cards in the bottom-right corner when risks are found. |
| `taintflow.mode` | `string` | `"auto"` | Scan engine mode: `auto` (hybrid API first + local fallback), `api` (cloud only), or `local` (Ollama only). |
| `taintflow.localModel` | `string` | `"auto"` | Select the local Ollama model to use. If `"auto"`, it automatically detects the best available coder/llama/gemma model. |
| `taintflow.providers` | `object` | `{ "anthropic": true, "google": true, "groq": true }` | Enable or disable individual cloud AI analysis providers. |
| `taintflow.google.apiKey` | `string` | `""` | Fallback Google Gemini API Key. |
| `taintflow.groq.apiKey` | `string` | `""` | Fallback Groq API Key. |

*Note: For security, it is recommended to write keys to the OS keychain using the command: `TaintFlow+: Configure Cloud API Keys...`.*

---

## 4. How to Implement & Build (For Developers)

### Initial Requirements
*   **Node.js**: Version 18 or higher.
*   **Git**: For version control.

### Setup and Dependencies
1. Clone the repository and navigate to the project root:
   ```bash
   git clone https://github.com/h3lium4u/TaintFlowPlus.git
   cd TaintFlowPlus
   ```
2. Install monorepo dependencies:
   ```bash
   npm install
   ```

### Compile and Package the Extension
1. Navigate to the extension folder:
   ```bash
   cd vscode-extension
   ```
2. Compile the TypeScript codebase:
   ```bash
   npm run compile
   ```
3. Package the extension into a `.vsix` file:
   ```bash
   npx @vscode/vsce package --no-dependencies -o taintflow-plus-v1.vsix
   ```

---

## 5. How to Use

### Real-Time Verification
*   **Automatic Scanning**: Simply write code or open files in your workspace. TaintFlow+ runs in the background and highlights vulnerable lines with red underlines (diagnostics).
*   **Issue List**: Open the **TaintFlow+** sidebar panel to view a structured hierarchical list of detected critical, high, medium, and low security findings across your workspace files.

### Using Graphify (Repository Map)
*   **Generate Map**: Click the **TaintFlow+** icon in the status bar or the sidebar and select "Open Graphify Map".
*   **Analyze Nodes**: View entry points, controllers, services, databases, external APIs, and security findings laid out as a visual node network.
*   **Interact**: Click on any node to jump to its source code, search nodes, or copy the context directly.

### Applying Fixes
*   **Inline Code Actions**: Place your cursor on any highlighted vulnerability.
*   **Quick Fix**: Click the lightbulb icon (`Ctrl+.` or `Cmd+.`) and select **"TaintFlow+: Explain and Fix Security Issue"** to automatically swap in the secure code recommendation.
