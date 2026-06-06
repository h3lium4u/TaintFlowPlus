# TaintFlow+ Release & Documentation Manifest

This document serves as the single source of truth for all project documentation, metadata, versions, configuration keys, and hosted assets for the **TaintFlow+** suite.

---

## 1. Extension Metadata

| Metadata Field | Value | Description |
| :--- | :--- | :--- |
| **Extension Name** | `taintflow-plus` | Package registry identifier |
| **Display Name** | `TaintFlow+ v1` | Display title in IDEs / Marketplace |
| **Publisher ID** | `F1ZZ4N` | Author credentials namespace |
| **Extension ID** | `f1zz4n.taintflow-plus` | Unique installation identifier |
| **Current Version** | `1.0.1` | Semantic version string |
| **License** | `MIT` | Open-source licensing protocol |
| **GitHub Repository** | `https://github.com/h3lium4u/TaintFlowPlus` | Code source repository |
| **Clone URL** | `https://github.com/h3lium4u/TaintFlowPlus.git` | Target clone repository |
| **Bugs / Issues** | `https://github.com/h3lium4u/TaintFlowPlus/issues` | Issue reporting channel |
| **Homepage** | `https://github.com/h3lium4u/TaintFlowPlus` | Main landing page |

---

## 2. Project Documentation Files Index

Here is a list of every Markdown (`.md`) file included in the repository, along with its specific purpose:

### 📄 Root Directory Files

*   **[README.md](README.md)**
    *   **Role**: Primary workspace documentation page.
    *   **Contents**: Full-screen node graph previews, architecture maps, detailed developer step-by-step setup guides, configuration settings explanations, and maintainer credentials.
*   **[CONTRIBUTING.md](CONTRIBUTING.md)**
    *   **Role**: Guidelines for developers contributing changes to the repository.
    *   **Contents**: Initial setup CLI steps, command reference guides, testing workflows, and local pull request check parameters.
*   **[SECURITY.md](SECURITY.md)**
    *   **Role**: Guidelines for reporting security vulnerabilities found in the analyzer engine itself.
    *   **Contents**: Disclosures guidelines, target contact email addresses, and expected security review SLAs.
*   **[PRIVACY.md](PRIVACY.md)**
    *   **Role**: Privacy statements detailing data management practices.
    *   **Contents**: Detailed explanation of the "Local-First" telemetry model and strict opt-in rules for external cloud LLM verification API providers.
*   **[ROADMAP.md](ROADMAP.md)**
    *   **Role**: Project milestones and future targets.
    *   **Contents**: Feature checklists for future releases, cross-agent memory modules, and IDE sidecar integrations.
*   **[SUPPORTED_IDES.md](SUPPORTED_IDES.md)**
    *   **Role**: IDE compatibility matrix.
    *   **Contents**: Verified compatibility configurations for VS Code, Cursor, Antigravity, and Windsurf IDE environments.
*   **[SECURITY_RULES.md](SECURITY_RULES.md)**
    *   **Role**: Verification reference guide.
    *   **Contents**: Enumerates default patterns for all 14+ supported languages and provides formatting examples for adding custom rules.
*   **[CHANGELOG.md](CHANGELOG.md)**
    *   **Role**: Version release history.
    *   **Contents**: Version logs, bug fix annotations, and feature release lists.

### 📄 Extension Directory Files

*   **[vscode-extension/README.md](vscode-extension/README.md)**
    *   **Role**: Extension marketplace detail page (rendered under the Details tab inside IDEs).
    *   **Contents**: Clean feature overviews, settings configurations table, interface overview descriptions, and quickstart setup steps.

---

## 3. Hosted Assets & Image Links

The following public URLs serve the static assets and screenshots referenced in the markdown documentation files:

| Asset Name | Target URL | Description / Role |
| :--- | :--- | :--- |
| **Main Project Logo** | `https://files.catbox.moe/ep1u9c.png` | Circular TF+ logo used at the top of the root README and on GitHub. |
| **Interface Overview** | `https://files.catbox.moe/ssb7ey.png` | Annotated screenshot showing the Status Bar (①), Sidebar Header (②), and Graphify Map (③) interfaces. |
| **Graphify Preview** | `https://files.catbox.moe/tawysg.png` | Full-screen node graph visualization mapping architecture connections, services, database interfaces, and security warnings. |
| **Diagnostics Preview** | `https://files.catbox.moe/x4zrhi.png` | Real-time VS Code editor editor screen displaying diagnostics highlighting and list sidebars. |

---

## 4. Key Settings & Extension Keys

| Configuration Key | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `taintflow.autoVerify` | `boolean` | `true` | Runs scanning automatically when files are opened, edited, or saved. |
| `taintflow.enableNotificationToasts` | `boolean` | `true` | Triggers notification alert cards when new risks are identified. |
| `taintflow.mode` | `string` | `"auto"` | Analysis routing: `auto` (hybrid), `api` (cloud only), `local` (Ollama only). |
| `taintflow.localModel` | `string` | `"auto"` | The local Ollama model to verify code with (e.g. `deepseek-coder:1.3b`). |
| `taintflow.providers` | `object` | `{ "anthropic": true, "google": true, "groq": true }` | Toggle switches for each cloud AI provider. |
| `taintflow.google.apiKey` | `string` | `""` | Gemini verification API key string (fallback). |
| `taintflow.groq.apiKey` | `string` | `""` | Groq verification API key string (fallback). |
