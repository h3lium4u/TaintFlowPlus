import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Missing WHERE clause on DELETE or UPDATE
        if (/^\s*(?:delete\s+from|update\s+\w+)/i.test(line) && !/\bwhere\b/i.test(line)) {
            findings.push({
                message: "SQL Warning: DELETE or UPDATE statement missing a WHERE clause. This affects all rows.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.endsWith(';') ? line.replace(';', ' WHERE id = ?;') : line + " WHERE id = ?"
            });
        }

        // 2. OR 1=1 (SQL Injection signature)
        if (/\bor\s+['"]?1['"]?\s*=\s*['"]?1['"]?/i.test(line)) {
            findings.push({
                message: "SQL Injection: OR 1=1 signature detected. This bypasses search logic or authentication.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "-- Use parameterized binding to safely pass inputs"
            });
        }

        // 3. SQL Comments (Truncation check)
        if (/--/.test(line) && !/^\s*--/.test(line)) {
            findings.push({
                message: "SQL Injection: Hyphens (--) detected in inline query. Often used to truncate SQL statements.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "low",
                suggestedFix: "-- Ensure inputs are fully parameterized"
            });
        }

        // 4. UNION SELECT
        if (/\bunion\s+(?:all\s+)?select\b/i.test(line)) {
            findings.push({
                message: "SQL Injection: UNION SELECT signature detected. Used to exfiltrate database contents.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "-- Avoid dynamic sql queries, use statement binding"
            });
        }

        // 5. Sleep / pg_sleep / benchmark
        if (/\b(?:pg_sleep|sleep|benchmark)\s*\(/.test(line)) {
            findings.push({
                message: "SQL Injection: Time-based blind SQL injection signature (sleep/benchmark) identified.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "-- Ensure inputs do not control query execution time"
            });
        }
    }

    return findings;
}
