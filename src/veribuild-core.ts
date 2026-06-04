import * as vscode from 'vscode';
import axios from 'axios';
import Groq from 'groq-sdk';

export interface Finding {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    lineStart: number;
    lineEnd: number;
    source: string;
    confidence: 'low' | 'medium' | 'high';
    suggestedFix?: string;
}

export interface ProviderContext {
    apiKey: string;
    extensionContext?: vscode.ExtensionContext;
}

export interface Provider {
    call(prompt: string, context: ProviderContext): Promise<string>;
}

export class OpenAIProvider implements Provider {
    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${context.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                }
            );
            return response.data.choices[0].message.content;
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            const errorMsg = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
            if (status === 429 || 
                errorMsg.toLowerCase().includes('rate') || 
                errorMsg.toLowerCase().includes('quota') || 
                errorMsg.toLowerCase().includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${errorMsg}`);
            }
        } else if (error.message) {
            const msg = error.message.toLowerCase();
            if (msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${error.message}`);
            }
        }
    }
}

export class AnthropicProvider implements Provider {
    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const response = await axios.post(
                'https://api.anthropic.com/v1/messages',
                {
                    model: 'claude-3-5-sonnet-20240620',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 1024,
                    temperature: 0.2,
                },
                {
                    headers: {
                        'x-api-key': context.apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                }
            );
            return response.data.content[0].text;
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            const errorMsg = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
            if (status === 429 || 
                errorMsg.toLowerCase().includes('rate') || 
                errorMsg.toLowerCase().includes('quota') || 
                errorMsg.toLowerCase().includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${errorMsg}`);
            }
        } else if (error.message) {
            const msg = error.message.toLowerCase();
            if (msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${error.message}`);
            }
        }
    }
}

export class GoogleProvider implements Provider {
    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${context.apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                }
            );
            return response.data.candidates[0].content.parts[0].text;
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            const errorMsg = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
            if (status === 429 || 
                errorMsg.toLowerCase().includes('rate') || 
                errorMsg.toLowerCase().includes('quota') || 
                errorMsg.toLowerCase().includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${errorMsg}`);
            }
        } else if (error.message) {
            const msg = error.message.toLowerCase();
            if (msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
                throw new Error(`rate_limit_or_quota_exceeded: ${error.message}`);
            }
        }
    }
}

export class GroqProvider implements Provider {
    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const groq = new Groq({
                apiKey: context.apiKey,
            });
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-70b-8192',
                temperature: 0.2,
            });
            return chatCompletion.choices[0]?.message?.content || '';
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        const status = error.status;
        const msg = String(error.message || error).toLowerCase();
        
        if (status === 429 || 
            msg.includes('rate') || 
            msg.includes('quota') || 
            msg.includes('limit')) {
            throw new Error(`rate_limit_or_quota_exceeded: ${error.message || error}`);
        }
    }
}

export class FallbackOrchestrator {
    private providers = new Map<string, Provider>();
    private circuitBreakers = new Map<string, { failures: number; state: 'CLOSED' | 'OPEN'; lastFailureTime: number }>();
    private activeKeyIndexes = new Map<string, number>();

    constructor(
        private secretStorage: vscode.SecretStorage,
        private outputChannel: vscode.OutputChannel
    ) {}

    registerProvider(id: string, provider: Provider) {
        this.providers.set(id, provider);
        this.circuitBreakers.set(id, { failures: 0, state: 'CLOSED', lastFailureTime: 0 });
        this.activeKeyIndexes.set(id, 0);
    }

    async callWithFallback(prompt: string, context?: any): Promise<string> {
        const config = vscode.workspace.getConfiguration('veribuild');
        const providersConfig = config.get<any>('providers');

        let enabledProviders: string[] = [];
        if (Array.isArray(providersConfig)) {
            enabledProviders = providersConfig;
        } else if (providersConfig && typeof providersConfig === 'object') {
            enabledProviders = Object.keys(providersConfig).filter(k => !!providersConfig[k]);
        } else {
            enabledProviders = ['openai', 'anthropic', 'google', 'groq'];
        }

        // Filter to only registered providers
        const registeredEnabledProviders = enabledProviders.filter(id => this.providers.has(id));

        const providerPriorities: { id: string; priority: number }[] = [];
        for (const id of registeredEnabledProviders) {
            const priority = config.get<number>(`${id}.priority`, 100);
            providerPriorities.push({ id, priority });
        }

        // Sort by priority (lower priority number goes first)
        providerPriorities.sort((a, b) => a.priority - b.priority);

        if (providerPriorities.length === 0) {
            throw new Error("No configured or enabled providers are available.");
        }

        for (const { id } of providerPriorities) {
            const cb = this.circuitBreakers.get(id);
            if (cb && cb.state === 'OPEN') {
                const elapsed = Date.now() - cb.lastFailureTime;
                if (elapsed >= 60000) {
                    cb.state = 'CLOSED';
                    cb.failures = 0;
                    this.outputChannel.appendLine(`Circuit breaker for ${id} reset to CLOSED after cooldown.`);
                } else {
                    this.outputChannel.appendLine(`Skipping provider ${id}: circuit breaker is OPEN. Cooldown remaining: ${Math.round((60000 - elapsed) / 1000)}s`);
                    continue;
                }
            }

            // Retrieve API key(s)
            const secretVal = await this.secretStorage.get(`veribuild.${id}.api_keys`) || 
                              await this.secretStorage.get(`veribuild.${id}.api_key`);
            if (!secretVal) {
                this.outputChannel.appendLine(`No API keys found for provider ${id} in SecretStorage.`);
                continue;
            }

            const apiKeys = secretVal.split(',').map(k => k.trim()).filter(Boolean);
            if (apiKeys.length === 0) {
                this.outputChannel.appendLine(`No valid API keys found for provider ${id}.`);
                continue;
            }

            let activeIndex = this.activeKeyIndexes.get(id) || 0;
            activeIndex = activeIndex % apiKeys.length;

            let success = false;
            let result = '';
            const currentCb = this.circuitBreakers.get(id)!;

            for (let attempt = 0; attempt < apiKeys.length; attempt++) {
                const keyIndex = (activeIndex + attempt) % apiKeys.length;
                const apiKey = apiKeys[keyIndex];

                try {
                    const provider = this.providers.get(id)!;
                    result = await provider.call(prompt, { apiKey, extensionContext: context });
                    
                    // Success details
                    currentCb.failures = 0;
                    currentCb.state = 'CLOSED';
                    this.activeKeyIndexes.set(id, keyIndex);
                    success = true;
                    break;
                } catch (err: any) {
                    this.outputChannel.appendLine(`Provider ${id} failed with key index ${keyIndex}: ${err.message || err}`);
                    
                    currentCb.failures++;
                    if (currentCb.failures >= 3) {
                        currentCb.state = 'OPEN';
                        currentCb.lastFailureTime = Date.now();
                        this.outputChannel.appendLine(`Circuit breaker opened for provider ${id} due to 3 consecutive failures.`);
                    }

                    this.activeKeyIndexes.set(id, (keyIndex + 1) % apiKeys.length);

                    if (currentCb.state === 'OPEN') {
                        break;
                    }
                }
            }

            if (success) {
                return result;
            }
        }

        throw new Error("All fallback providers failed to process the request.");
    }
}

export class VeriBuildEngine {
    public ollamaAvailable = false;
    private orchestrator: FallbackOrchestrator;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel
    ) {
        this.orchestrator = new FallbackOrchestrator(context.secrets, outputChannel);
        this.orchestrator.registerProvider('openai', new OpenAIProvider());
        this.orchestrator.registerProvider('anthropic', new AnthropicProvider());
        this.orchestrator.registerProvider('google', new GoogleProvider());
        this.orchestrator.registerProvider('groq', new GroqProvider());
    }

    async initialize(): Promise<void> {
        try {
            const response = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
            if (response.status === 200) {
                this.ollamaAvailable = true;
                this.outputChannel.appendLine("Ollama is available and running.");
            } else {
                this.ollamaAvailable = false;
                this.outputChannel.appendLine(`Ollama check returned status ${response.status}.`);
            }
        } catch (error) {
            this.ollamaAvailable = false;
            this.outputChannel.appendLine("Ollama is not running (ping http://localhost:11434/api/tags failed).");
        }
    }

    async analyzeCode(code: string, filePath: string): Promise<Finding[]> {
        const staticFindings = this.runStaticAnalysis(code, filePath);

        const prompt = `Analyze the following source code from file "${filePath}" for security vulnerabilities and code quality issues.
Return the results ONLY as a JSON array of objects matching this TypeScript interface:
interface Finding {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    lineStart: number;
    lineEnd: number;
    source: string;
    confidence: 'low' | 'medium' | 'high';
    suggestedFix?: string; // a string proposing replacement code/text to fix the issue, if applicable
}

Ensure the "source" property is set to "LLM" for all findings.
Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json. Do not include any conversational text.

Code:
\`\`\`
${code}
\`\`\``;

        const linesCount = code.split(/\r?\n/).length;

        if (this.ollamaAvailable && linesCount < 500) {
            try {
                this.outputChannel.appendLine("Running code analysis using Ollama (deepseek-coder:1.3b)...");
                const response = await axios.post('http://localhost:11434/api/generate', {
                    model: 'deepseek-coder:1.3b',
                    prompt: prompt,
                    stream: false,
                    format: 'json'
                }, {
                    timeout: 45000
                });
                const responseText = response.data.response;
                const parsed = JSON.parse(responseText);
                const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
                const llmFindings = this.sanitizeFindings(rawFindings);
                return [...staticFindings, ...llmFindings];
            } catch (err) {
                this.outputChannel.appendLine(`Ollama analysis failed: ${err}. Falling back to FallbackOrchestrator...`);
            }
        }

        try {
            this.outputChannel.appendLine("Running code analysis using FallbackOrchestrator...");
            const responseText = await this.orchestrator.callWithFallback(prompt, this.context);
            const cleanedText = this.cleanJsonResponse(responseText);
            const parsed = JSON.parse(cleanedText);
            const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
            const llmFindings = this.sanitizeFindings(rawFindings);
            return [...staticFindings, ...llmFindings];
        } catch (err: any) {
            this.outputChannel.appendLine(`FallbackOrchestrator analysis failed: ${err.message || err}`);
            return staticFindings;
        }
    }

    private runStaticAnalysis(code: string, filePath: string): Finding[] {
        const findings: Finding[] = [];
        const lines = code.split(/\r?\n/);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            
            // 1. console.log(password)
            if (/console\.log\(.*password.*\)/i.test(line)) {
                findings.push({
                    message: "Potential exposure of sensitive data: console.log of password",
                    severity: "high",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "high",
                    suggestedFix: "// console.log(...) removed for security"
                });
            }
            
            // 2. eval(
            if (/eval\s*\(/.test(line)) {
                findings.push({
                    message: "Use of eval() is a security risk and allows arbitrary code execution",
                    severity: "critical",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "high",
                    suggestedFix: "/* eval(...) removed for security */"
                });
            }
            
            // 3. innerHTML
            if (/\.innerHTML\s*=/.test(line)) {
                findings.push({
                    message: "Use of innerHTML can lead to Cross-Site Scripting (XSS) vulnerabilities",
                    severity: "medium",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "high",
                    suggestedFix: line.replace('.innerHTML', '.textContent')
                });
            }
            
            // 4. Hardcoded keys
            if (/(?:const|let|var|private|public|protected|readonly)?\s*\w*(?:key|token|secret|password|credential|private_key|privatekey)\w*\s*=\s*['"`][a-zA-Z0-9_\-+=/]{16,}['"`]/i.test(line)) {
                findings.push({
                    message: "Potential hardcoded secret or API key identified",
                    severity: "high",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "medium",
                    suggestedFix: line.replace(/=\s*['"`][a-zA-Z0-9_\-+=/]{16,}['"`]/, '= process.env.SECRET_KEY')
                });
            }
            
            // 5. SQL injection
            if (/select\s+.*\s+from\s+.*\s+where\s+.*\+\s*\w+/i.test(line) || /select\s+.*\s+from\s+.*\s+where\s+.*\$\{.*\}/i.test(line)) {
                findings.push({
                    message: "Potential SQL Injection vulnerability due to dynamic SQL query construction",
                    severity: "high",
                    lineStart: lineNum,
                    lineEnd: lineNum,
                    source: "static-analysis",
                    confidence: "medium",
                    suggestedFix: "// TODO: Use parameterized queries to prevent SQL injection"
                });
            }
        }
        
        return findings;
    }

    private sanitizeFindings(findings: any[]): Finding[] {
        if (!Array.isArray(findings)) return [];
        return findings.map(f => ({
            message: String(f.message || 'Security or quality issue identified'),
            severity: ['low', 'medium', 'high', 'critical'].includes(String(f.severity).toLowerCase()) 
                ? String(f.severity).toLowerCase() as any 
                : 'medium',
            lineStart: typeof f.lineStart === 'number' ? f.lineStart : 1,
            lineEnd: typeof f.lineEnd === 'number' ? f.lineEnd : 1,
            source: String(f.source || 'LLM'),
            confidence: ['low', 'medium', 'high'].includes(String(f.confidence).toLowerCase())
                ? String(f.confidence).toLowerCase() as any
                : 'medium',
            suggestedFix: f.suggestedFix ? String(f.suggestedFix) : undefined
        }));
    }

    private cleanJsonResponse(text: string): string {
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\r?\n/, '');
            cleaned = cleaned.replace(/\r?\n```$/, '');
            cleaned = cleaned.trim();
        }
        return cleaned;
    }
}
