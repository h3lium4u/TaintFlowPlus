import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. SQL Injection: mysqli_query with variables, etc.
        if (/\b(?:mysqli_query|pg_query|db_query)\s*\(.*\$[a-zA-Z_]\w*/.test(line) || (/(?:select|insert|update|delete)\s+.*\s+from\s+/i.test(line) && line.includes('$'))) {
            findings.push({
                message: "PHP SQL Injection: Query function executed directly using variables.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Use prepared statements (PDO/mysqli_prepare) instead"
            });
        }

        // 2. Command Injection
        if (/\b(?:exec|shell_exec|system|passthru)\s*\(/.test(line)) {
            findings.push({
                message: "PHP Command Injection: Call to shell execution helper functions (exec, system) with inputs.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Avoid shell commands. Use PHP native functions if possible."
            });
        }

        // 3. Dynamic File Inclusion
        if (/\b(?:include|include_once|require|require_once)\s*\(?\s*\$[a-zA-Z_]\w*/.test(line)) {
            findings.push({
                message: "PHP File Inclusion: include/require statement using dynamic variable path.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Use a whitelist of files or secure configuration maps instead"
            });
        }

        // 4. PHP Eval
        if (/\beval\s*\(/.test(line)) {
            findings.push({
                message: "PHP RCE: Use of eval() is highly dangerous and allows arbitrary PHP execution.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "/* php eval removed */"
            });
        }

        // 5. Hardcoded credentials (length >= 8)
        if (/\$[a-zA-Z_]\w*(?:key|token|secret|password|credential|pass)\w*\s*=\s*['"]([^'"]{8,})['"]/i.test(line)) {
            findings.push({
                message: "Potential hardcoded PHP credentials or configuration secret.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/=\s*['"].*?['"]/, "= getenv('SECRET_KEY')")
            });
        }

        // 6. PHP XSS (echo direct output of variable)
        if (/\becho\s+[^;]*(?!\bhtmlspecialchars\b)(?!\bhtmlentities\b)\$[a-zA-Z_]\w*/i.test(line)) {
            findings.push({
                message: "PHP XSS: Output variables directly printed via echo without htmlspecialchars escaping.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/echo\s+.*?\$([a-zA-Z_]\w*).*?;/i, "echo \"<div>\" . htmlspecialchars(\\$$1, ENT_QUOTES, 'UTF-8') . \"</div>\";")
            });
        }
    }

    return findings;
}
