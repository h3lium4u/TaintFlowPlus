import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. JSON Hardcoded secrets/API keys
        if (/"[^"]*(?:key|token|secret|password|credential|private_key|privatekey)[^"]*"\s*:\s*"([a-zA-Z0-9_\-+=/]{16,})"/i.test(line)) {
            findings.push({
                message: "Potential hardcoded secret or API key identified in JSON configuration",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/:\s*"[a-zA-Z0-9_\-+=/]{16,}"/, ': "YOUR_API_KEY_HERE"')
            });
        }

        // 2. Package wildcard dependencies in package.json
        if (filePath.endsWith('package.json')) {
            if (/"[^"]+"\s*:\s*"\*"/i.test(line)) {
                findings.push({
                    message: "Avoid using wildcard version '*' for dependencies in package.json",
                    severity: "medium",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "high"
                });
            }
        }

        // 3. IAM/Policy Wildcard Access in JSON configuration
        if (/"Principal"\s*:\s*"\*"/i.test(line) || /"Action"\s*:\s*"\*"/i.test(line)) {
            findings.push({
                message: "Security Warning: Wildcard '*' identity or action permissions detected in JSON configuration.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium"
            });
        }

        // 4. Insecure HTTP url binding in JSON configuration
        if (/"\w*url\w*"\s*:\s*"http:\/\//i.test(line) && !/localhost/i.test(line)) {
            findings.push({
                message: "Insecure Protocol: URL in JSON configuration uses unencrypted http:// rather than https://.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace("http://", "https://")
            });
        }

        // 5. Hardcoded Database Connection String with Credentials
        if (/"\w*conn\w*string\w*"\s*:\s*"[^"]*password\s*=/i.test(line) || /"[^"]*connection\s*string[^"]*"\s*:\s*"[^"]*pwd\s*=/i.test(line)) {
            findings.push({
                message: "Credential Leak: Hardcoded database credentials detected in connection string.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high"
            });
        }
    }

    return findings;
}

