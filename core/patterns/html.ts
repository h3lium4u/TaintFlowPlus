import { Finding } from '../taintflow-engine';

export function analyze(lines: string[], filePath: string): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // 1. Missing Content-Security-Policy meta tag (only if it's head or HTML entry structure)
        if (filePath.endsWith('.html') && /<head>/i.test(line) && !lines.some(l => /http-equiv\s*=\s*['"]Content-Security-Policy['"]/i.test(l))) {
            findings.push({
                message: "Security Warning: Missing Content-Security-Policy (CSP) meta tag in HTML head.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: '<meta http-equiv="Content-Security-Policy" content="default-src \'self\';">'
            });
        }

        // 2. Clickjacking / Iframe embed risk (check if frame-ancestors is present in CSP if CSP exists, or missing X-Frame-Options equivalent)
        if (/<iframe\s+[^>]*src\s*=\s*['"](?!https:\/\/)(?!http:\/\/)\w+/i.test(line)) {
            findings.push({
                message: "HTML Clickjacking / Framing Risk: Iframe loading dynamically or unsafely without frame-ancestors restriction.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "medium"
            });
        }

        // 3. Form action hijacking / dynamic target without HTTPS
        if (/<form\s+[^>]*action\s*=\s*['"]http:\/\//i.test(line)) {
            findings.push({
                message: "Security Risk: Form data is submitted over unencrypted HTTP protocol.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace("http://", "https://")
            });
        }

        // 4. Form action dynamically constructed or missing strict destination
        if (/<form\s+[^>]*action\s*=\s*['"]\s*['"]/i.test(line)) {
            findings.push({
                message: "Security Risk: Empty form action submits data back to the current URL, which can be hijacked via parameters.",
                severity: "medium",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace(/action\s*=\s*['"]\s*['"]/, 'action="/submit-form"')
            });
        }

        // 5. Insecure inline script or script block loading external code via HTTP
        if (/<script\s+[^>]*src\s*=\s*['"]http:\/\//i.test(line)) {
            findings.push({
                message: "XSS/Man-in-the-Middle Risk: Loading external script over unencrypted HTTP.",
                severity: "critical",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace("http://", "https://")
            });
        }

        // 6. SVG script injections (stored XSS vector inside HTML/SVGs)
        if (/<svg\s+[^>]*onload\s*=/i.test(line) || /<svg\s+[^>]*>.*?<script/i.test(line)) {
            findings.push({
                message: "Potential XSS: Inline SVG element with onload handler or script tag detected.",
                severity: "high",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high"
            });
        }

        // 7. Input autofocus/autofill capturing credentials automatically
        if (/<input\s+[^>]*type\s*=\s*['"]password['"][^>]*autocomplete\s*=\s*['"]on['"]/i.test(line)) {
            findings.push({
                message: "HTML credential risk: autofill autocomplete should be off or new-password for sensitive forms.",
                severity: "low",
                lineStart: lineNum,
                lineEnd: lineNum,
                source: "static-analysis",
                confidence: "high",
                suggestedFix: line.replace(/autocomplete\s*=\s*['"]on['"]/, 'autocomplete="new-password"')
            });
        }
    }

    return findings;
}
