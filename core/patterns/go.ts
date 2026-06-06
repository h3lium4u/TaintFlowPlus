import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Go SQL Injection: Query format/sprintf or concat
        if (/\.Query\s*\(\s*(?:fmt\.Sprintf|.*?\+.*)/.test(line) || (/(?:select|insert|update|delete)\s+.*\s+from\s+/i.test(line) && (line.includes('+') || line.includes('Sprintf')))) {
            findings.push({
                message: "Go SQL Injection: db.Query executed using string concatenation or fmt.Sprintf.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Use db.Query(\"SELECT ... WHERE id = ?\", id) instead"
            });
        }

        // 2. Go Command Injection: exec.Command with non-string arguments
        if (/\bexec\.Command\s*\([^)]*?\)/.test(line) && !/\bexec\.Command\s*\(\s*(?:"[^"]*"|`[^`]*`)\s*(?:,\s*(?:"[^"]*"|`[^`]*`)\s*)*\)/.test(line)) {
            findings.push({
                message: "Go Command Injection: exec.Command called with dynamic/variable arguments.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Ensure executable binary name and arguments are parameterized safely"
            });
        }

        // 3. Go Path Traversal: ReadFile dynamic path
        if (/\b(?:ioutil|os)\.ReadFile\s*\(\s*(?!["'])\w+/.test(line)) {
            findings.push({
                message: "Go Path Traversal: Reading file using dynamic variable file path.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Use filepath.Clean(path) and ensure it stays inside base directory"
            });
        }

        // 4. Go Template Injection: template.HTML unescaped HTML segments
        if (/\btemplate\.HTML\s*\(\s*(?!["'])\w+/.test(line)) {
            findings.push({
                message: "Go XSS: template.HTML creates unescaped HTML segments directly from variable.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Escape user input HTML using html.EscapeString(input) first"
            });
        }
    }

    return findings;
}
