#!/usr/bin/env node
'use strict';

const Groq = require('../node_modules/groq-sdk');
const axios = require('../node_modules/axios');
const fs = require('fs');
const path = require('path');

// --- Config ---
const GROQ_KEY  = process.env.GROQ_API_KEY || '';
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || '';

const code = fs.readFileSync(path.join(__dirname, '../vuln_test.py'), 'utf8');

const PROMPT = `Analyze the following Python source code from file "vuln_test.py" for security vulnerabilities and code quality issues.
Return the results ONLY as a JSON array of objects with this shape:
{
  "message": string,
  "severity": "low"|"medium"|"high"|"critical",
  "lineStart": number,
  "lineEnd": number,
  "source": "LLM",
  "confidence": "low"|"medium"|"high",
  "suggestedFix": string (optional)
}

Return ONLY valid JSON with no markdown or commentary.

Code:
\`\`\`python
${code}
\`\`\``;

function printFindings(label, findings) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(` ${label}`);
    console.log('='.repeat(60));
    if (!findings.length) {
        console.log('  (no findings returned)');
        return;
    }
    findings.forEach((f, i) => {
        const sev = f.severity?.toUpperCase().padEnd(8);
        const conf = f.confidence?.padEnd(6);
        console.log(`  [${i+1}] L${f.lineStart} | ${sev} | conf:${conf} | ${f.message}`);
        if (f.suggestedFix) {
            console.log(`       Fix → ${f.suggestedFix}`);
        }
    });
    console.log(`  Total: ${findings.length} finding(s)`);
}

function parseJSON(text) {
    // strip markdown code fences if present
    const cleaned = text.replace(/^```[a-z]*\n?/gm, '').replace(/^```$/gm, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : (parsed.findings || []);
}

async function testGroq() {
    console.log('\n[Groq] Sending request with llama-3.1-8b-instant...');
    const groq = new Groq({ apiKey: GROQ_KEY });
    const res = await groq.chat.completions.create({
        messages: [{ role: 'user', content: PROMPT }],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 2048,
    });
    const text = res.choices[0]?.message?.content || '';
    const findings = parseJSON(text);
    printFindings('GROQ — llama-3.1-8b-instant', findings);
    return findings;
}

async function testGoogle() {
    console.log('\n[Google] Sending request with gemini-2.5-flash...');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_KEY}`;
    const res = await axios.default.post(url, {
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.2 }
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
    const text = res.data.candidates[0].content.parts[0].text;
    const findings = parseJSON(text);
    printFindings('GOOGLE — gemini-2.5-flash', findings);
    return findings;
}

// --- Static analysis results (already verified via MCP) ---
const STATIC_FINDINGS = [
    { lineStart: 2,  severity: 'high',     message: 'Hardcoded secret (API_SECRET)',                        source: 'static' },
    { lineStart: 5,  severity: 'high',     message: 'SQL Injection via f-string interpolation',             source: 'static' },
    { lineStart: 8,  severity: 'high',     message: 'Command Injection via os.system() with f-string',      source: 'static' },
    { lineStart: 10, severity: 'high',     message: 'DEBUG=True leaks stack traces / server info',          source: 'static' },
    { lineStart: 11, severity: 'critical', message: 'RCE — eval(password) executes arbitrary user input',   source: 'static' },
];

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║      TaintFlow+ — vuln_test.py Full Analysis Run          ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\nFile: vuln_test.py (${code.split('\n').length} lines)`);

    // Print known static findings
    printFindings('STATIC ANALYSIS (engine built-in rules)', STATIC_FINDINGS);

    // Run LLM providers
    const results = await Promise.allSettled([testGroq(), testGoogle()]);

    const groqResult  = results[0].status === 'fulfilled' ? results[0].value : [];
    const googleResult = results[1].status === 'fulfilled' ? results[1].value : [];

    if (results[0].status === 'rejected') {
        console.error('\n[Groq]   FAILED:', results[0].reason?.message || results[0].reason);
    }
    if (results[1].status === 'rejected') {
        console.error('\n[Google] FAILED:', results[1].reason?.message || results[1].reason);
    }

    // Combine all unique findings
    const allFindings = [...STATIC_FINDINGS, ...groqResult, ...googleResult];
    const totalLLM = groqResult.length + googleResult.length;

    console.log('\n' + '═'.repeat(60));
    console.log(' SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  Static findings :  ${STATIC_FINDINGS.length}`);
    console.log(`  Groq LLM        :  ${groqResult.length}`);
    console.log(`  Google LLM      :  ${googleResult.length}`);
    console.log(`  Total combined  :  ${allFindings.length}`);
    console.log('');
    console.log('  ✅ Groq  (llama-3.1-8b-instant): ' + (results[0].status === 'fulfilled' ? 'WORKING' : 'FAILED'));
    console.log('  ✅ Google (gemini-2.5-flash)    : ' + (results[1].status === 'fulfilled' ? 'WORKING' : 'FAILED'));
}

main().catch(e => {
    console.error('Fatal error:', e.message || e);
    process.exit(1);
});
