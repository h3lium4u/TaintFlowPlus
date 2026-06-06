# Privacy Policy

Your privacy and the security of your codebase are core design pillars of TaintFlow+. This policy explains how your source code, configurations, and credentials are handled.

---

## Core Privacy Statement

**TaintFlow+ does not collect, harvest, or transmit your source code, repository metadata, or configuration details to any external telemetry servers or central collection points.** All processing is managed either strictly on your local machine or sent directly to your configured AI providers.

---

## Data Handling & Processing Modes

TaintFlow+ executes in three distinct execution modes depending on your configuration (`taintflow.mode`):

### 1. Local Analysis (Static Rule Engine)
*   All static analysis scans, regex match operations, and taint tracking are executed entirely within your local IDE process.
*   No internet connection is required, and no data leaves your filesystem.

### 2. Ollama Processing (Local LLM)
*   When executing in `local` mode or falling back to local processing, code verification requests are dispatched to a local Ollama service running on `http://localhost:11434`.
*   Data transmission is restricted entirely to your local loopback address (`127.0.0.1`). No network traffic is routed outside your machine.

### 3. Cloud Provider Processing (Gemini, Groq, Anthropic)
*   When executing in `api` or `auto` mode, code payloads are sent directly to the AI service endpoints of the providers you have enabled (Google Gemini, Groq, or Anthropic).
*   **Opt-In**: This is an opt-in behavior that requires you to configure API keys.
*   **Direct Channel**: Payloads are transmitted directly from your machine to the respective provider's APIs over TLS. No intermediary server is used.
*   **Third-Party Terms**: Data sent to these endpoints is subject to the data usage policies of the respective providers. (We recommend reviewing Google Gemini's and Groq's developer privacy terms to verify their zero data retention or non-training commitments).

---

## API Key & Credential Handling

-   **Secret Storage**: API keys configured via the Command Palette are saved using VS Code's `secrets` API. This API maps directly to your operating system's secure credential manager (e.g., Windows Credential Manager, macOS Keychain, or Linux Keyring/dbus).
-   **No Plain-Text Storage**: We strongly discourage storing API keys in plain text within your `.vscode/settings.json` file.
-   **Local Environments**: Keys stored in `.env` files are only read by local build scripts and the MCP server process at startup and are never checked into version control (as `.env` is listed in `.gitignore`).

---

## Data Storage & Visualizations

-   **Graphify Memory Store**: Graphify builds index maps of your repository to facilitate architectural visualizations and feed context into the LLMs.
-   **Storage Location**: This metadata is written locally to a `.taintflow/` directory located at the root of your project workspace. This folder should be ignored in git and is never sent to any external server.
-   **Visual Rendering**: The webview visualizations are rendered directly in your IDE process using a local sandboxed canvas.

---

## Telemetry Statement

TaintFlow+ contains **no analytics tracking, telemetry capture, crash reporting libraries, or usage statistic transmitters**. We do not count the number of files you verify, the number of issues you fix, or track your workspace habits.
