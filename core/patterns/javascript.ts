import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. console.log(password/secret)
        if (/console\.log\(.*(?:password|secret|token|credential).*\)/i.test(line)) {
            findings.push({
                message: "Potential exposure of sensitive data: console.log of password or credential key.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// console.log(...) removed for security"
            });
        }

        // 2. eval()
        if (/\beval\s*\(/.test(line)) {
            findings.push({
                message: "Use of eval() is a severe security risk and allows arbitrary code execution.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "/* Use JSON.parse or safe function references instead of eval */"
            });
        }

        // 3. innerHTML / outerHTML
        if (/\.(?:innerHTML|outerHTML)\s*=/.test(line) && !/['"`]\s*['"`]/.test(line)) {
            findings.push({
                message: "Use of innerHTML/outerHTML can lead to Cross-Site Scripting (XSS) vulnerabilities.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/\.innerHTML/, '.textContent').replace(/\.outerHTML/, '.textContent')
            });
        }

        // 4. Hardcoded keys (length >= 16)
        if (/(?:const|let|var|private|public|protected|readonly)?\s*\w*(?:key|token|secret|password|credential|private_key|privatekey)\w*\s*=\s*['"`][a-zA-Z0-9_\-+=/]{16,}['"`]/i.test(line)) {
            findings.push({
                message: "Potential hardcoded secret, credential key, or API token identified.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/=\s*['"`][a-zA-Z0-9_\-+=/]{16,}['"`]/, '= process.env.API_KEY')
            });
        }

        // 5. SQL injection concat or dynamic template
        if (/select\s+.*\s+from\s+.*\s+where\s+.*\+\s*\w+/i.test(line) || /select\s+.*\s+from\s+.*\s+where\s+.*\$\{.*\}/i.test(line)) {
            findings.push({
                message: "Potential SQL Injection vulnerability due to dynamic SQL query construction.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Use parameterized queries or prepared statement bindings"
            });
        }

        // 6. React dangerouslySetInnerHTML
        if (/dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:/.test(line)) {
            findings.push({
                message: "React XSS Risk: Use of dangerouslySetInnerHTML bypasses XSS protection.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Use DOMPurify.sanitize(html) before passing to dangerouslySetInnerHTML, or use safe JSX bindings"
            });
        }

        // 7. React javascript: URL protocol injection
        if (/(?:href|src)\s*=\s*(?:['"`]javascript:|\{\s*['"`]javascript:)/i.test(line)) {
            findings.push({
                message: "React/DOM XSS Risk: Use of javascript: protocol in href or src attribute allows arbitrary script execution.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Validate URL protocol is http: or https:, or use a button with onClick instead"
            });
        }

        // 8. LocalStorage/SessionStorage Secrets
        if (/(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`].*?(?:password|passwd|secret|token|auth).*?['"]/i.test(line)) {
            findings.push({
                message: "Sensitive Data Exposure: Storing secrets, passwords, or tokens in localStorage/sessionStorage is vulnerable to XSS retrieval.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Store sensitive session tokens in secure HTTP-only cookies"
            });
        }

        // 9. Client-side Open Redirect
        if (/(?:window|document)\.location\.(?:href|replace|assign)\s*=\s*(?!['"\/])(?:\w+|\$\{)/.test(line)) {
            findings.push({
                message: "Open Redirect Risk: Setting location dynamically using unvalidated variables.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Sanitize the redirect target or restrict to a strict path allowlist"
            });
        }

        // 10. postMessage with wildcard targetOrigin
        if (/\.postMessage\s*\(\s*.*?\s*,\s*['"]\*['"]\s*\)/.test(line)) {
            findings.push({
                message: "Security Risk: postMessage sent with targetOrigin '*' can leak sensitive data to malicious frame parents.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace(/'\*'|"\*"/, "window.location.origin")
            });
        }
    }

    return findings;
}

