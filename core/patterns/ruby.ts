import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Ruby SQL Injection: where with interpolation
        if (/\.where\s*\(\s*["'].*#\{.*\}.*["']\s*\)/.test(line)) {
            findings.push({
                message: "Ruby SQL Injection: ActiveRecord where condition contains interpolated string.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "User.where(\"name = ?\", user)"
            });
        }

        // 2. Ruby Command Injection: backticks or system with interpolation
        if (/`.*#\{.*\}.*`/.test(line) || /\bsystem\s*\(\s*["'].*#\{.*\}["']\s*\)/.test(line)) {
            findings.push({
                message: "Ruby Command Injection: Execution of shell command via backticks or system with interpolation.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "system('rm', '-rf', user)"
            });
        }

        // 3. Ruby Eval
        if (/\beval\s*\(/.test(line) || /\beval\b/.test(line)) {
            findings.push({
                message: "Ruby RCE: Use of eval() is unsafe with dynamic user input.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Removed eval for security"
            });
        }

        // 4. Ruby Deserialization: YAML.load
        if (/YAML\.load\s*\(/.test(line)) {
            findings.push({
                message: "Ruby Deserialization: YAML.load is unsafe. Use YAML.safe_load to avoid code execution.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace("YAML.load", "YAML.safe_load")
            });
        }
    }

    return findings;
}
