import { Finding } from '../taintflow-engine';
import * as path from 'path';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. SQL Injection: f-string
        if (/\bcursor\.execute\s*\(\s*f['"].*?\{.*?\}['"]\s*\)/.test(line)) {
            findings.push({
                message: "Python SQL Injection: Use of cursor.execute with f-string formatting.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "cursor.execute(\"SELECT * FROM users WHERE name = %s\", (user_input,))"
            });
        }
        // 2. SQL Injection: %s formatting
        else if (/\bcursor\.execute\s*\(\s*['"].*?%s.*?['"]\s*%\s*\w+\)/.test(line)) {
            findings.push({
                message: "Python SQL Injection: Use of cursor.execute with %s string formatting.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "cursor.execute(\"SELECT * FROM users WHERE name = %s\", (user_input,))"
            });
        }
        // 3. SQL Injection: General dynamic query string
        else if (/(?:select|insert|update|delete)\s+.*\s+from\s+/i.test(line) && (line.includes('{') || line.includes('%') || line.includes('+'))) {
            findings.push({
                message: "Python SQL Injection: Dynamic query string formatting or interpolation.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "# Use parameterized query cursor.execute(\"SELECT ... WHERE id = %s\", (val,))"
            });
        }

        // 4. Command Injection: os.system
        if (/\bos\.system\s*\(\s*f['"].*?\{.*?\}['"]\s*\)/.test(line) || /os\.system\s*\(/.test(line)) {
            findings.push({
                message: "Python Command Injection: Call to os.system with dynamic f-string formatting.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Use subprocess.run with shell=False instead"
            });
        }

        // 5. Command Injection: subprocess with shell=True
        if (/subprocess\.(?:call|run|Popen)\s*\(.*?shell\s*=\s*True.*?\)/.test(line)) {
            findings.push({
                message: "Python Command Injection: Subprocess invocation with shell=True is unsafe.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace("shell=True", "shell=False")
            });
        }

        // 6. Debug Mode Left On
        if (/\bDEBUG\s*=\s*True\b/.test(line)) {
            findings.push({
                message: "Python Security: Debug mode (DEBUG=True) is active. This can leak stack traces and server details.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "    DEBUG = False"
            });
        }

        // 7. eval / exec
        if (/\beval\s*\(/.test(line)) {
            findings.push({
                message: "Python RCE: Use of eval() is highly dangerous with untrusted inputs.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Removed eval for security"
            });
        }
        if (/\bexec\s*\(/.test(line)) {
            findings.push({
                message: "Python RCE: Use of exec() is highly dangerous with untrusted inputs.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Removed exec for security"
            });
        }

        // 8. Pickle Deserialization
        if (/pickle\.loads\s*\(/.test(line)) {
            findings.push({
                message: "Python Deserialization: pickle.loads() is dangerous and leads to arbitrary code execution.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Use safe format like json.loads() instead"
            });
        }

        // 9. Hardcoded Secrets
        if (/\b\w*(?:key|token|secret|password|credential|pass)\w*\s*=\s*['"]([^'"]{8,})['"]/i.test(line) && !/env/i.test(line)) {
            findings.push({
                message: "Potential hardcoded Python secret or credentials identified.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: line.replace(/=\s*['"].*?['"]/, "= os.environ.get('SECRET_KEY')")
            });
        }

        // 10. Path Traversal
        if (/\bopen\s*\(\s*f['"].*?\{.*?\}['"]/.test(line)) {
            findings.push({
                message: "Python Path Traversal: open() function called with dynamic f-string path variable.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: "# Ensure path is checked and kept inside target directory"
            });
        } else if (/\bopen\s*\(\s*(?!['"])(?!sys\.argv)\w+/.test(line) && !/\bopen\s*\(\s*f['"]/.test(line)) {
            findings.push({
                message: "Python Path Traversal: open() function called with dynamic path variable.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium",
                suggestedFix: "# Ensure path is checked and kept inside target directory"
            });
        }
    }

    return findings;
}
