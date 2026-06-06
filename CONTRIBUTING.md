# Contributing to TaintFlow+

Thank you for your interest in contributing to TaintFlow+! Contributions from the community help make this code verification platform robust, fast, and secure for everyone.

Please review the guidelines below to ensure a smooth contribution process.

---

## Coding Standards

- **TypeScript first**: All code in the extension, core engine, and servers must be written in TypeScript.
- **Maintainable & Clean Code**: Follow standard ES6+ conventions. Use descriptive, self-documenting naming.
- **Strict Typing**: Avoid using `any` whenever possible. Make use of interfaces and strict types to ensure type safety.
- **Unit Tests**: Ensure all pattern-matching logic has corresponding code samples in `test-files/` and tests are added in `scripts/run-tests.js`.
- **Pre-Commit Checks**: Always run `npm run test` and `npm run build` before pushing code.

---

## Development Setup

TaintFlow+ is structured as a monorepo containing the following parts:
- `core/`: Common static-analysis rules and pattern engine.
- `vscode-extension/`: VS Code extension wrapper, Webviews, and editor integrations.
- `mcp-server/`: Model Context Protocol server exposing the security engine as a tool.
- `oxp-server/`: Visualizations server.
- `antigravity-skill/`: Local agent helper.

### Prerequisites
- Node.js (v18 or v20 recommended)
- Git
- VS Code, Cursor, or Antigravity

### Initial Configuration
1.  Clone the repository:
    ```bash
    git clone https://github.com/h3lium4u/TaintFlowPlus.git
    cd TaintFlowPlus
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your local environment file:
    Create a `.env` file at the root of the project with any API keys you wish to use for testing:
    ```env
    TAINTFLOW_GROQ_API_KEY=gsk_...
    TAINTFLOW_GOOGLE_API_KEY=AIzaSy...
    ```
4.  Run unit tests to verify the setup:
    ```bash
    npm run test
    ```
5.  Build the workspace:
    ```bash
    npm run build
    ```

---

## How to Contribute

### 1. Bug Reports
If you find a bug, please check the existing issues. If none match, open a new issue detailing:
- The expected behavior vs. actual behavior.
- The operating system and version of the IDE.
- Steps to reproduce, including code snippets where possible.
- Relevant logs from the `TaintFlow+` Output Channel.

### 2. Feature Requests
To propose a feature:
- Clearly explain the problem this feature solves.
- Describe the proposed solution or design.
- Explain potential alternative approaches.

### 3. Pull Requests
1.  Fork the repository and create your feature branch:
    ```bash
    git checkout -b feature/amazing-feature
    ```
2.  Commit your changes. Ensure commit messages are descriptive and reference any related issues.
3.  Write/update unit tests for new scanning rules or logic.
4.  Run tests locally:
    ```bash
    npm run test
    ```
5.  Push your changes and submit a Pull Request to the `master` branch.

---

## Code of Conduct

Please be respectful and professional in all communications. We are dedicated to providing a welcoming, inclusive, and harassment-free experience for everyone.
