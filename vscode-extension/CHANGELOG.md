# Changelog

All notable changes to the **TaintFlow+** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-05

### Added
- **Security Verification Engine**: Real-time static analysis and semantic taint tracking across 14+ programming languages (Python, JS/TS, Java, Go, PHP, SQL, Ruby, Rust, C#, HTML, R, YAML, C++, Dockerfile).
- **Ollama Support**: Integrated local, privacy-first LLM analysis using offline models (`deepseek-coder:1.3b` and `gemma3:1b`) to analyze code completely offline.
- **Cloud AI Support**: Orchestration layer featuring a smart fallback mechanism with circuit-breaker protection across Groq (Llama 3), Google Gemini, and Anthropic.
- **Graphify Repository Intelligence**: Static analysis crawler to discover system architectural boundaries, mapping out Entry Points, Services, APIs, Databases, and core frameworks.
- **Neural Flow & Security Flow Visualizations**: Dynamic Canvas-based rendering to show real-time dependencies and tracing of data flows from sources to sensitive sinks.
- **Vulnerability Highlighting & Code Actions**: Direct diagnostic warnings in the editor and inline Quick Fixes that suggest secure code refactorings via LLMs.
- **Unified MCP Server Integration**: Multi-client Model Context Protocol server allowing Cursor, Windsurf, and Antigravity (Gemini Code Assistant) to share configurations and run analysis.
- **Secure Secret Storage**: Operating-system level storage for API tokens via VS Code's `secrets` API.
