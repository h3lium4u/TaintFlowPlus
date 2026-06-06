# Security Policy

We take the security of TaintFlow+ and the code it analyzes seriously. This document outlines the procedures for reporting vulnerabilities and our commitment to a secure, responsible disclosure process.

---

## Supported Versions

Only the latest release of TaintFlow+ is actively supported for security updates. If you discover an issue, please ensure you are running the most recent version of the extension or server before reporting.

| Version | Supported |
| :--- | :--- |
| v1.x.x | Yes (Active) |
| < v1.0.0 | No |

---

## Reporting a Vulnerability

If you identify a security vulnerability in TaintFlow+ itself (such as a local privilege escalation, insecure API key storage, or code execution vulnerability in the analyzer), please do **not** open a public issue. Instead, follow these steps to report it privately:

1.  **Security Contact**: Email us at [security@taintflowplus.com](mailto:security@taintflowplus.com) (or the primary maintainer's contact: [mohamedfaizaan5779@gmail.com](mailto:mohamedfaizaan5779@gmail.com)).
2.  **Details to Include**:
    *   A descriptive title.
    *   The version of TaintFlow+ affected.
    *   The OS version and IDE details (VS Code, Cursor, etc.).
    *   A step-by-step description of the vulnerability, including PoC code or screenshots.
    *   The impact of the issue and how a potential attacker could exploit it.

---

## Responsible Disclosure & Timeline

We are committed to resolving vulnerabilities as quickly as possible. Once a report is received, you can expect the following timeline:

-   **Acknowledgment**: Within 48 hours of your report submission.
-   **Triage**: Within 5 business days, we will confirm the vulnerability and assess its severity.
-   **Resolution**: We aim to deliver a patch or mitigation within 30 days. In complex cases, we will communicate progress regularly.
-   **Public Disclosure**: We coordinate public disclosure with reporters once a patch is published, providing appropriate credit for the discovery.

Please refrain from sharing details of the vulnerability publicly until a patch has been released.

Thank you for helping keep TaintFlow+ secure!
