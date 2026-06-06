import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Statement vs PreparedStatement
        if (/\bStatement\s+\w+\s*=\s*\w+\.createStatement\(\)/.test(line)) {
            findings.push({
                message: "Java SQL Injection risk: Use of Statement. PreparedStatement is preferred for SQL queries.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "Statement stmt = conn.prepareStatement(sql);"
            });
        }

        // 2. Dynamic sql concatenation
        if (/\.execute(?:Query|Update)?\s*\(\s*[^)]*?\+[^)]*?\)/.test(line) || (/(?:select|insert|update|delete)\s+.*\s+from\s+/i.test(line) && line.includes('+'))) {
            findings.push({
                message: "Java SQL Injection risk: Dynamic query string concatenation detected.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// TODO: Rewrite using PreparedStatement binding placeholders (?)"
            });
        }

        // 3. Command Injection Runtime.exec
        if (/Runtime\.getRuntime\(\)\.exec\s*\(/.test(line)) {
            findings.push({
                message: "Java Command Injection: Direct call to Runtime.exec() can be unsafe with untrusted inputs.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// TODO: Sanitize arguments or use safer ProcessBuilder api"
            });
        }

        // 4. ProcessBuilder injection risk
        if (/new\s+ProcessBuilder\s*\(/.test(line)) {
            findings.push({
                message: "Java Command Injection: Use of ProcessBuilder should be strictly audited for argument injection.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// TODO: Ensure all ProcessBuilder arguments are strictly validated list of parameters"
            });
        }

        // 5. Path Traversal
        if (/new\s+FileInputStream\s*\(\s*(?!["'])\w+/.test(line) || /new\s+FileReader\s*\(\s*(?!["'])\w+/.test(line)) {
            findings.push({
                message: "Java Path Traversal: FileInputStream/FileReader constructed with dynamic variable.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// TODO: Normalize and validate input path against base directory"
            });
        }

        // 6. XML XXE
        if (/DocumentBuilderFactory\.newInstance\(\)/.test(line)) {
            findings.push({
                message: "Java XXE: XML DocumentBuilderFactory created without explicit secure processing features.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "dbf.setFeature(\"http://apache.org/xml/features/disallow-doctype-decl\", true);"
            });
        }

        // 7. ObjectInputStream Deserialization
        if (/new\s+ObjectInputStream\s*\(/.test(line)) {
            findings.push({
                message: "Java Deserialization: ObjectInputStream can execute arbitrary code during deserialization.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// TODO: Use safe serialization format (like JSON or Protobuf)"
            });
        }

        // 8. Sensitive Logging
        if (/\b(?:log|logger)\.(?:error|info|warn|debug)\s*\(\s*.*(?:password|secret|key).*\)/i.test(line)) {
            findings.push({
                message: "Sensitive logging: Potential exposure of password or secret in logger output.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Remove or mask sensitive values before logging"
            });
        }

        // 9. Hardcoded secrets (length >= 8)
        if (/\bString\s+\w*(?:key|token|secret|password|credential|pass)\w*\s*=\s*"([^"]{8,})"/i.test(line)) {
            findings.push({
                message: "Potential hardcoded Java secret or credential identified.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "String apiKey = System.getenv(\"SECRET_KEY\");"
            });
        }

        // 10. ScriptEngine eval
        if (/\.eval\s*\(/.test(line)) {
            findings.push({
                message: "Use of ScriptEngine.eval() is a high-risk remote code execution vulnerability.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "/* script eval removed for security */"
            });
        }
    }

    return findings;
}
