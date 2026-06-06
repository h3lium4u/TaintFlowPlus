import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Rust SQL Injection: format! inside sqlx::query
        if (/\bsqlx::query(?:_as)?\s*\(\s*&?format!\(/.test(line) || /\bformat!\s*\(\s*&?["'].*?(?:select|insert|update|delete)\b/i.test(line)) {
            findings.push({
                message: "Rust SQL Injection: Query formatted dynamically using format! macro.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// Use placeholders query(\"SELECT ... WHERE id = $1\").bind(id)"
            });
        }

        // 2. Rust Command Injection: Command dynamic args
        if (/\.arg(?:s)?\s*\(\s*(?!&?["'])\w+/.test(line) || /\bCommand::new\s*\(\s*(?!&?["'])\w+/.test(line)) {
            findings.push({
                message: "Rust Command Injection: Command spawned with dynamic variable arguments.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Ensure executable name and arguments are safe from injection"
            });
        }

        // 3. Rust Path Traversal: dynamic path read
        if (/\bfs::(?:read|read_to_string|File::open)\s*\(\s*(?!&?["'])\w+/.test(line)) {
            findings.push({
                message: "Rust Path Traversal: File read method executed using dynamic path variable.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "// Canonicalize path and ensure it starts with base workspace prefix"
            });
        }

        // 4. Rust Unsafe block
        if (/\bunsafe\s*\{/.test(line)) {
            findings.push({
                message: "Rust Unsafe Block: Use of unsafe code blocks should be minimized and audited.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "// TODO: Verify if unsafe code block can be refactored into safe Rust"
            });
        }
    }

    return findings;
}
