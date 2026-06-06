# TaintFlow+ Product Roadmap

This document outlines the planned future features and development goals for TaintFlow+. We aim to expand the engine from a single-user real-time scanner into a deeply integrated, cross-agent repository memory and security intelligence platform.

---

## 📅 Short-Term (Next 3 Months)

### 1. Security Flow Enhancements
*   **Detailed Taint-Trace Nodes**: Interactive node expansion showing variable values at intermediate lines along a taint path in the editor webview.
*   **Variable State Tracking**: Track re-assignments in loops to reduce false-positive rates on complex sanitizer functions.

### 2. Additional AI Providers
*   **Local Open WebUI integration**: Support pointing the API requests to standard OpenAI-compatible endpoints (e.g. LocalAI, LM Studio, vLLM).
*   **Azure OpenAI**: Enterprise authentication integration for teams using internal Azure LLM nodes.

### 3. Multi-Agent Context Memory
*   **Unified Agent Context**: Allow different coding agents (such as Antigravity, Cursor Agent, and inline chats) to query a shared, transient security scan memory, reducing redundant LLM analysis calls.

---

## 📅 Medium-Term (Next 6 Months)

### 4. Cross-Agent Knowledge Graph
*   **Dynamic Relational Graphing**: Expand the Graphify indexing engine to map dependencies across workspaces and write shared relationships into a project knowledge graph.
*   **Shared Vulnerability Baseline**: Allow agents to query historical security mitigations within the workspace, recommending code fixes that conform to past patterns approved by the developer.

### 5. Advanced RAG (Retrieval-Augmented Generation)
*   **Semantic Rule Search**: Match code segments not just with regex rules, but using vector embeddings of security standards (such as OWASP Top 10 or CWE databases) to identify semantic patterns of vulnerability.

---

## 📅 Long-Term (12 Months & Beyond)

### 6. AI Repository Intelligence
*   **Automatic Remediation Agents**: Background worker bots that can draft pull requests proposing comprehensive mitigations for architectural vulnerabilities discovered by Graphify.
*   **Interactive Architecture Audits**: Converse with your repository graph directly ("Which APIs in my app are not protected by authentication middleware?") and receive annotated flow diagrams.

### 7. Team Repository Memory
*   **Distributed Team Sync**: Synchronize Graphify indexes, baseline exceptions, and verified safe findings across teams using peer-to-peer or secured central repositories.
*   **Shared Policy Injection**: Push custom security guidelines and taint filters globally to all developers working on a shared repository.
