import * as fs from 'fs';
try {
    fs.appendFileSync('d:\\TaintFlow+\\activation_debug.log', `[${new Date().toISOString()}] taintflow-core.ts: module loading started\n`, 'utf-8');
} catch (e) {}

import * as vscode from 'vscode';
import axios from 'axios';
import Groq from 'groq-sdk';
import * as path from 'path';

export interface Finding {
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    lineStart: number;
    lineEnd: number;
    source: string;
    confidence: 'low' | 'medium' | 'high';
    suggestedFix?: string;
    columnStart?: number;
    columnEnd?: number;
    ruleId?: string;
}

export interface ProviderContext {
    apiKey: string;
    extensionContext?: vscode.ExtensionContext;
}

export interface Provider {
    readonly model: string;
    call(prompt: string, context: ProviderContext): Promise<string>;
}

// OpenAI provider removed — quota exceeded. Use Google or Groq instead.

export class AnthropicProvider implements Provider {
    readonly model = 'claude-3-5-sonnet-20240620';
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
            const isRateLimit = /\b(rate|quota|limit)\b/i.test(errorMsg);
            if (status === 429 || isRateLimit) {
                throw new Error(`rate_limit_or_quota_exceeded: ${errorMsg}`);
            }
        } else if (error.message) {
            const msg = error.message;
            const isRateLimit = /\b(rate|quota|limit)\b/i.test(msg);
            if (msg.includes('429') || isRateLimit) {
                throw new Error(`rate_limit_or_quota_exceeded: ${error.message}`);
            }
        }
    }
}

export class GoogleProvider implements Provider {
    readonly model = 'gemini-2.5-flash';
    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${context.apiKey}`,
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
            // Treat NOT_FOUND (404) as a hard error so the orchestrator skips this provider
            if (status === 404) {
                throw new Error(`provider_not_found: ${errorMsg}`);
            }
            const isRateLimit = /\b(rate|quota|limit)\b/i.test(errorMsg);
            if (status === 429 || isRateLimit) {
                throw new Error(`rate_limit_or_quota_exceeded: ${errorMsg}`);
            }
        } else if (error.message) {
            const msg = error.message;
            const isRateLimit = /\b(rate|quota|limit)\b/i.test(msg);
            if (msg.includes('429') || isRateLimit) {
                throw new Error(`rate_limit_or_quota_exceeded: ${error.message}`);
            }
        }
    }
}

/**
 * Truncates a prompt to stay within a safe token budget.
 * Rough estimate: 1 token ≈ 4 characters. Keeps the header/instructions intact
 * and trims the code block if needed.
 */
function truncatePromptToTokenBudget(prompt: string, maxChars: number): string {
    if (prompt.length <= maxChars) {
        return prompt;
    }
    // Find the code block start and trim from there
    const codeBlockMarker = '\n```\n';
    const codeStart = prompt.lastIndexOf(codeBlockMarker);
    if (codeStart === -1) {
        return prompt.substring(0, maxChars);
    }
    const header = prompt.substring(0, codeStart + codeBlockMarker.length);
    const availableChars = maxChars - header.length - 60; // reserve space for closing
    if (availableChars <= 0) {
        return prompt.substring(0, maxChars);
    }
    const codeContent = prompt.substring(codeStart + codeBlockMarker.length);
    const truncated = codeContent.substring(0, availableChars);
    return header + truncated + '\n... [code truncated for token limit]\n```';
}

export class GroqProvider implements Provider {
    // llama-3.1-8b-instant has a much higher TPM limit (~100k vs 12k for 70b)
    readonly model = 'llama-3.1-8b-instant';
    // Safe char budget: ~9000 tokens * 4 chars/token = 36000 chars
    private static readonly MAX_PROMPT_CHARS = 36000;

    async call(prompt: string, context: ProviderContext): Promise<string> {
        try {
            const groq = new Groq({
                apiKey: context.apiKey,
            });
            const truncatedPrompt = truncatePromptToTokenBudget(prompt, GroqProvider.MAX_PROMPT_CHARS);
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: truncatedPrompt }],
                model: 'llama-3.1-8b-instant',
                temperature: 0.2,
                max_tokens: 2048,
            });
            return chatCompletion.choices[0]?.message?.content || '';
        } catch (error: any) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: any) {
        const status = error.status;
        const msg = String(error.message || error);
        const isRateLimit = /\b(rate|quota|limit|413|too large)\b/i.test(msg);
        
        if (status === 429 || status === 413 || isRateLimit) {
            throw new Error(`rate_limit_or_quota_exceeded: ${error.message || error}`);
        }
    }
}

export class FallbackOrchestrator {
    public providers = new Map<string, Provider>();
    private circuitBreakers = new Map<string, { failures: number; state: 'CLOSED' | 'OPEN'; lastFailureTime: number }>();
    private activeKeyIndexes = new Map<string, number>();
    public activeProviderId: string | undefined;

    constructor(
        private secretStorage: vscode.SecretStorage,
        private outputChannel: vscode.OutputChannel
    ) {}

    registerProvider(id: string, provider: Provider) {
        this.providers.set(id, provider);
        this.circuitBreakers.set(id, { failures: 0, state: 'CLOSED', lastFailureTime: 0 });
        this.activeKeyIndexes.set(id, 0);
    }

    async isProviderConfiguredAndEnabled(id: string): Promise<boolean> {
        if (!this.providers.has(id)) {
            return false;
        }
        const config = vscode.workspace.getConfiguration('taintflow');
        const providersConfig = config.get<any>('providers');

        let enabledProviders: string[] = [];
        if (Array.isArray(providersConfig)) {
            enabledProviders = providersConfig;
        } else if (providersConfig && typeof providersConfig === 'object') {
            enabledProviders = Object.keys(providersConfig).filter(k => !!providersConfig[k]);
        } else {
            enabledProviders = ['google', 'groq', 'anthropic'];
        }

        if (!enabledProviders.includes(id)) {
            return false;
        }

        // Check if API key is configured
        let secretVal: string | undefined;
        if (this.secretStorage) {
            try {
                secretVal = await this.secretStorage.get(`taintflow.${id}.api_keys`) || 
                            await this.secretStorage.get(`taintflow.${id}.api_key`);
            } catch (err: any) {
                this.outputChannel.appendLine(`TaintFlow+: Error reading secret for ${id}: ${err.message || err}`);
            }
        }
        if (secretVal && secretVal.trim()) {
            return true;
        }
        const apiKey = config.get<string>(`${id}.apiKey`);
        if (apiKey && apiKey.trim()) {
            return true;
        }

        return false;
    }

    async getPrimaryProviderId(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('taintflow');
        const providersConfig = config.get<any>('providers');

        let enabledProviders: string[] = [];
        if (Array.isArray(providersConfig)) {
            enabledProviders = providersConfig;
        } else if (providersConfig && typeof providersConfig === 'object') {
            enabledProviders = Object.keys(providersConfig).filter(k => !!providersConfig[k]);
        } else {
            enabledProviders = ['google', 'groq', 'anthropic'];
        }

        const registeredEnabledProviders = enabledProviders.filter(id => this.providers.has(id));

        const providerPriorities: { id: string; priority: number }[] = [];
        for (const id of registeredEnabledProviders) {
            const priority = config.get<number>(`${id}.priority`, 100);
            providerPriorities.push({ id, priority });
        }

        // Sort by priority (lower priority number goes first)
        providerPriorities.sort((a, b) => a.priority - b.priority);

        for (const { id } of providerPriorities) {
            let secretVal: string | undefined;
            if (this.secretStorage) {
                try {
                    secretVal = await this.secretStorage.get(`taintflow.${id}.api_keys`) || 
                                await this.secretStorage.get(`taintflow.${id}.api_key`);
                } catch (err: any) {
                    this.outputChannel.appendLine(`TaintFlow+: Error reading secret for ${id}: ${err.message || err}`);
                }
            }
            if (secretVal && secretVal.trim()) {
                return id;
            }
        }

        // Fallback check directly in settings
        for (const { id } of providerPriorities) {
            const apiKey = config.get<string>(`${id}.apiKey`);
            if (apiKey && apiKey.trim()) {
                return id;
            }
        }

        return undefined;
    }

    async callWithFallback(prompt: string, context?: any): Promise<string> {
        const config = vscode.workspace.getConfiguration('taintflow');
        const providersConfig = config.get<any>('providers');

        let enabledProviders: string[] = [];
        if (Array.isArray(providersConfig)) {
            enabledProviders = providersConfig;
        } else if (providersConfig && typeof providersConfig === 'object') {
            enabledProviders = Object.keys(providersConfig).filter(k => !!providersConfig[k]);
        } else {
            enabledProviders = ['google', 'groq', 'anthropic'];
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
                if (elapsed >= 15000) {
                    cb.state = 'CLOSED';
                    cb.failures = 0;
                    this.outputChannel.appendLine(`Circuit breaker for ${id} reset to CLOSED after cooldown.`);
                } else {
                    this.outputChannel.appendLine(`Skipping provider ${id}: circuit breaker is OPEN. Cooldown remaining: ${Math.round((15000 - elapsed) / 1000)}s`);
                    continue;
                }
            }

            // Retrieve API key(s)
            let secretVal: string | undefined;
            if (this.secretStorage) {
                try {
                    secretVal = await this.secretStorage.get(`taintflow.${id}.api_keys`) || 
                                await this.secretStorage.get(`taintflow.${id}.api_key`);
                } catch (err: any) {
                    this.outputChannel.appendLine(`TaintFlow+: Error reading secret for ${id}: ${err.message || err}`);
                }
            }
            if (!secretVal) {
                const config = vscode.workspace.getConfiguration('taintflow');
                secretVal = config.get<string>(`${id}.apiKey`);
            }
            if (!secretVal) {
                this.outputChannel.appendLine(`No API keys found for provider ${id} in SecretStorage or workspace settings.`);
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
                    this.activeProviderId = id;
                    this.outputChannel.appendLine(`Provider ${id} (${provider.model}) successfully processed the request.`);
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

export class TaintFlowEngine {
    public ollamaAvailable = false;
    public ollamaModels: string[] = [];
    private orchestrator: FallbackOrchestrator;
    private apiCheckInterval: NodeJS.Timeout | undefined;
    public onModeChange: (() => void) | undefined;
    private _isCurrentlyUsingOllama = false;
    public activeModel = 'None';

    public get isCurrentlyUsingOllama(): boolean {
        return this._isCurrentlyUsingOllama;
    }
    public set isCurrentlyUsingOllama(val: boolean) {
        if (this._isCurrentlyUsingOllama !== val) {
            this._isCurrentlyUsingOllama = val;
            this.updateActiveModel().then(() => {
                this.onModeChange?.();
            });
        }
    }

    getBestOllamaModel(): string {
        try {
            const configuredModel = vscode.workspace.getConfiguration('taintflow').get<string>('localModel', '').trim();
            if (configuredModel && configuredModel !== 'auto') {
                return configuredModel;
            }
        } catch (e) {}
        if (this.ollamaModels.length === 0) {
            return 'deepseek-coder:1.3b';
        }
        const preferences = ['deepseek-coder:1.3b', 'gemma3:1b'];
        for (const pref of preferences) {
            if (this.ollamaModels.includes(pref)) {
                return pref;
            }
        }
        const coderModel = this.ollamaModels.find(m => m.toLowerCase().includes('coder'));
        if (coderModel) return coderModel;
        const commonModel = this.ollamaModels.find(m => m.toLowerCase().includes('gemma') || m.toLowerCase().includes('llama'));
        if (commonModel) return commonModel;
        return this.ollamaModels[0];
    }

    async updateActiveModel(): Promise<void> {
        if (this.isCurrentlyUsingOllama) {
            const statusSuffix = this.ollamaAvailable ? '' : ' (Offline)';
            this.activeModel = `Ollama: ${this.getBestOllamaModel()}${statusSuffix}`;
            return;
        }

        if (this.orchestrator.activeProviderId) {
            const isConfigured = await this.orchestrator.isProviderConfiguredAndEnabled(this.orchestrator.activeProviderId);
            if (!isConfigured) {
                this.orchestrator.activeProviderId = undefined;
            }
        }

        if (this.orchestrator.activeProviderId) {
            const provider = this.orchestrator.providers.get(this.orchestrator.activeProviderId);
            if (provider) {
                const name = this.orchestrator.activeProviderId.charAt(0).toUpperCase() + this.orchestrator.activeProviderId.slice(1);
                this.activeModel = `${name}: ${provider.model}`;
                return;
            }
        }

        // Determine from config if no successful call yet
        const primaryId = await this.orchestrator.getPrimaryProviderId();
        if (primaryId) {
            const provider = this.orchestrator.providers.get(primaryId);
            if (provider) {
                const name = primaryId.charAt(0).toUpperCase() + primaryId.slice(1);
                this.activeModel = `${name}: ${provider.model}`;
                return;
            }
        }

        this.activeModel = 'No API/Ollama configured';
    }

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel
    ) {
        this.orchestrator = new FallbackOrchestrator(context.secrets, outputChannel);
        // OpenAI removed (quota exceeded)
        this.orchestrator.registerProvider('anthropic', new AnthropicProvider());
        this.orchestrator.registerProvider('google', new GoogleProvider());
        this.orchestrator.registerProvider('groq', new GroqProvider());
    }

    async hasConfiguredApi(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('taintflow');
        const providersConfig = config.get<any>('providers');
        let enabledProviders: string[] = ['google', 'groq', 'anthropic'];
        if (Array.isArray(providersConfig)) {
            enabledProviders = providersConfig;
        } else if (providersConfig && typeof providersConfig === 'object') {
            enabledProviders = Object.keys(providersConfig).filter(k => !!providersConfig[k]);
        }
        
        for (const id of enabledProviders) {
            let secretVal: string | undefined;
            if (this.context.secrets) {
                try {
                    secretVal = await this.context.secrets.get(`taintflow.${id}.api_keys`) || 
                                await this.context.secrets.get(`taintflow.${id}.api_key`);
                } catch (err: any) {
                    // ignore/log
                }
            }
            if (secretVal && secretVal.trim()) {
                return true;
            }
            const apiKey = config.get<string>(`${id}.apiKey`);
            if (apiKey && apiKey.trim()) {
                return true;
            }
        }
        return false;
    }

    async checkApiConnection(): Promise<boolean> {
        try {
            this.outputChannel.appendLine("Timer: checking API connectivity...");
            await this.orchestrator.callWithFallback("respond with 'ok'", this.context);
            this.outputChannel.appendLine("Timer: API connectivity check succeeded.");
            return true;
        } catch (error) {
            return false;
        }
    }

    getMode(): 'auto' | 'api' | 'local' {
        try {
            const mode = vscode.workspace.getConfiguration('taintflow').get<string>('mode', 'auto');
            if (mode === 'api' || mode === 'local' || mode === 'auto') {
                return mode;
            }
        } catch (e) {}
        return 'auto';
    }

    private startApiCheckTimer() {
        if (this.apiCheckInterval) {
            return;
        }
        if (this.getMode() !== 'auto') {
            return; // Only run reconnection check in Auto/Hybrid mode
        }
        this.outputChannel.appendLine("Starting automatic 15-second API reconnection check timer.");
        this.apiCheckInterval = setInterval(async () => {
            if (this.isCurrentlyUsingOllama) {
                const connected = await this.checkApiConnection();
                if (connected) {
                    this.isCurrentlyUsingOllama = false;
                    this.outputChannel.appendLine("Successfully connected to API. Switching back to API primary mode.");
                    this.stopApiCheckTimer();
                }
            } else {
                this.stopApiCheckTimer();
            }
        }, 15000);
    }

    private stopApiCheckTimer() {
        if (this.apiCheckInterval) {
            clearInterval(this.apiCheckInterval);
            this.apiCheckInterval = undefined;
            this.outputChannel.appendLine("Stopped API reconnection check timer.");
        }
    }

    dispose() {
        this.stopApiCheckTimer();
    }

    async callModel(prompt: string): Promise<string> {
        const mode = this.getMode();

        if (mode === 'local') {
            await this.checkOllamaAvailability();
            if (this.ollamaAvailable) {
                const bestModel = this.getBestOllamaModel();
                try {
                    this.outputChannel.appendLine(`callModel (Local): querying Ollama using model "${bestModel}"...`);
                    const response = await axios.post('http://localhost:11434/api/generate', {
                        model: bestModel,
                        prompt: prompt,
                        stream: false,
                    }, {
                        timeout: 45000
                    });
                    return response.data.response;
                } catch (err) {
                    this.outputChannel.appendLine(`callModel (Local) Ollama failed: ${err}.`);
                    throw err;
                }
            } else {
                throw new Error("Ollama is not available, but TaintFlow+ is in Local LLM only mode.");
            }
        }

        if (mode === 'api') {
            try {
                return await this.orchestrator.callWithFallback(prompt, this.context);
            } catch (err: any) {
                this.outputChannel.appendLine(`callModel (API only) FallbackOrchestrator failed: ${err.message || err}.`);
                throw err;
            }
        }

        // 'auto' mode
        if (!this.isCurrentlyUsingOllama) {
            try {
                return await this.orchestrator.callWithFallback(prompt, this.context);
            } catch (err: any) {
                this.outputChannel.appendLine(`callModel FallbackOrchestrator failed: ${err.message || err}. Falling back to Ollama...`);
                this.isCurrentlyUsingOllama = true;
                this.startApiCheckTimer();
            }
        }

        // Dynamically verify if Ollama is running now
        await this.checkOllamaAvailability();

        if (this.isCurrentlyUsingOllama && this.ollamaAvailable) {
            const bestModel = this.getBestOllamaModel();
            try {
                this.outputChannel.appendLine(`callModel: querying Ollama using model "${bestModel}"...`);
                const response = await axios.post('http://localhost:11434/api/generate', {
                    model: bestModel,
                    prompt: prompt,
                    stream: false,
                }, {
                    timeout: 45000
                });
                return response.data.response;
            } catch (err) {
                this.outputChannel.appendLine(`callModel Ollama failed: ${err}.`);
            }
        }

        return await this.orchestrator.callWithFallback(prompt, this.context);
    }

    async checkOllamaAvailability(): Promise<boolean> {
        try {
            const response = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
            if (response.status === 200) {
                this.ollamaAvailable = true;
                if (response.data && Array.isArray(response.data.models)) {
                    this.ollamaModels = response.data.models.map((m: any) => m.name);
                }
                return true;
            }
        } catch (error) {
            // ignore
        }
        this.ollamaAvailable = false;
        return false;
    }

    async initialize(): Promise<void> {
        await this.checkOllamaAvailability();

        const mode = this.getMode();
        this.outputChannel.appendLine(`TaintFlow+: Initializing engine in mode: ${mode}`);

        if (mode === 'local') {
            this.isCurrentlyUsingOllama = true;
            this.outputChannel.appendLine("TaintFlow+: Running in Local LLM only mode (using Ollama).");
        } else if (mode === 'api') {
            this.isCurrentlyUsingOllama = false;
            this.outputChannel.appendLine("TaintFlow+: Running in API models only mode.");
        } else { // 'auto'
            const apiConfigured = await this.hasConfiguredApi();
            if (!apiConfigured && this.ollamaAvailable) {
                this.isCurrentlyUsingOllama = true;
                this.outputChannel.appendLine("No API keys configured. Running in Ollama mode.");
                this.startApiCheckTimer();
            } else {
                this.isCurrentlyUsingOllama = false;
                this.outputChannel.appendLine("API keys are configured. Running in API primary mode.");
            }
        }
        await this.updateActiveModel();
    }

    /**
     * Fast static-only analysis — no LLM calls, no tokens used.
     * Suitable for real-time feedback while the user is typing.
     */
    analyzeCodeStatic(code: string, filePath: string, languageId?: string): Finding[] {
        return this.runStaticAnalysis(code, filePath, languageId);
    }

    async analyzeCode(code: string, filePath: string, languageId?: string): Promise<Finding[]> {
        const staticFindings = this.runStaticAnalysis(code, filePath, languageId);
        const linesCount = code.split(/\r?\n/).length;

        // If code has more than 1000 lines, chunk it to avoid LLM context / token limits
        if (linesCount > 1000) {
            this.outputChannel.appendLine(`File has ${linesCount} lines. Splitting into chunks to avoid API/LLM limits...`);
            try {
                const llmFindings = await this.analyzeLargeCodeInChunks(code, filePath, languageId);
                const allFindings = [...staticFindings];
                const seen = new Set<string>();
                for (const f of staticFindings) {
                    seen.add(`${f.severity}-${f.lineStart}-${f.lineEnd}-${f.message}`);
                }
                for (const f of llmFindings) {
                    const key = `${f.severity}-${f.lineStart}-${f.lineEnd}-${f.message}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        allFindings.push(f);
                    }
                }
                return allFindings;
            } catch (chunkErr: any) {
                this.outputChannel.appendLine(`Chunked analysis failed: ${chunkErr.message || chunkErr}. Returning static findings.`);
                return staticFindings;
            }
        }

        try {
            const llmFindings = await this.runLLMAnalysis(code, filePath, languageId);
            return [...staticFindings, ...llmFindings];
        } catch (err: any) {
            this.outputChannel.appendLine(`LLM analysis failed: ${err.message || err}. Returning static findings.`);
            return staticFindings;
        }
    }

    private async analyzeLargeCodeInChunks(code: string, filePath: string, languageId?: string): Promise<Finding[]> {
        const lines = code.split(/\r?\n/);
        const chunkSize = 1000;
        const overlap = 100;
        const step = chunkSize - overlap; // 900
        const totalLines = lines.length;

        const allLLMFindings: Finding[] = [];
        let startLineIdx = 0;
        let chunkIndex = 0;

        while (startLineIdx < totalLines) {
            const endLineIdx = Math.min(startLineIdx + chunkSize, totalLines);
            const chunkLines = lines.slice(startLineIdx, endLineIdx);
            const chunkCode = chunkLines.join('\n');
            const offset = startLineIdx; // 0-indexed line offset

            this.outputChannel.appendLine(`Analyzing chunk #${chunkIndex + 1} (lines ${startLineIdx + 1} to ${endLineIdx})...`);

            try {
                const chunkFindings = await this.runLLMAnalysis(chunkCode, filePath, languageId);
                // Adjust lines by chunk offset
                const adjustedFindings = chunkFindings.map(f => ({
                    ...f,
                    lineStart: f.lineStart + offset,
                    lineEnd: f.lineEnd + offset
                }));
                allLLMFindings.push(...adjustedFindings);
            } catch (err: any) {
                this.outputChannel.appendLine(`Failed to analyze chunk #${chunkIndex + 1}: ${err.message || err}`);
            }

            if (endLineIdx >= totalLines) {
                break;
            }
            startLineIdx += step;
            chunkIndex++;
        }

        return allLLMFindings;
    }

    private async runLLMAnalysis(code: string, filePath: string, languageId?: string): Promise<Finding[]> {
        let graphifyContextStr = '';
        try {
            const stateModule = require('./state');
            if (stateModule && stateModule.TaintFlowState && stateModule.TaintFlowState.scanner) {
                const memory = stateModule.TaintFlowState.scanner.getMemory();
                if (memory) {
                    const generatorModule = require('./graphify/context-generator');
                    const aiContext = generatorModule.ContextGenerator.generateAIContext(memory);
                    
                    let relPath = filePath;
                    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (root) {
                        relPath = path.relative(root, filePath).replace(/\\/g, '/');
                    }
                    const fileContext = generatorModule.ContextGenerator.explainFile(memory, relPath, 'text');
                    graphifyContextStr = `\n--- Repository Context ---\n${aiContext}\n--- File Context ---\n${fileContext}\n---------------------------\n`;
                }
            }
        } catch (e) {
            // Ignore if state or graphify is not available
        }

        const prompt = `Analyze the following source code from file "${filePath}" for security vulnerabilities and code quality issues.${graphifyContextStr}
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

        const mode = this.getMode();

        if (mode === 'local') {
            await this.checkOllamaAvailability();
            if (this.ollamaAvailable) {
                const bestModel = this.getBestOllamaModel();
                try {
                    this.outputChannel.appendLine(`Running code analysis (Local) using Ollama (${bestModel})...`);
                    const response = await axios.post('http://localhost:11434/api/generate', {
                        model: bestModel,
                        prompt: prompt,
                        stream: false,
                        format: 'json'
                    }, {
                        timeout: 60000
                    });
                    const responseText = response.data.response;
                    const cleanedText = this.cleanJsonResponse(responseText);
                    
                    let parsed: any;
                    try {
                        parsed = JSON.parse(cleanedText);
                    } catch (jsonErr) {
                        const startIdx = cleanedText.indexOf('[');
                        const endIdx = cleanedText.lastIndexOf(']');
                        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                            const extracted = cleanedText.substring(startIdx, endIdx + 1);
                            parsed = JSON.parse(extracted);
                        } else {
                            throw jsonErr;
                        }
                    }
                    
                    const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
                    return this.sanitizeFindings(rawFindings);
                } catch (err) {
                    this.outputChannel.appendLine(`Ollama analysis failed: ${err}.`);
                    throw err;
                }
            } else {
                throw new Error("Ollama is not running.");
            }
        }

        if (mode === 'api') {
            try {
                this.outputChannel.appendLine("Running code analysis (API only) using FallbackOrchestrator...");
                const responseText = await this.orchestrator.callWithFallback(prompt, this.context);
                await this.updateActiveModel();
                const cleanedText = this.cleanJsonResponse(responseText);
                const parsed = JSON.parse(cleanedText);
                const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
                return this.sanitizeFindings(rawFindings);
            } catch (err: any) {
                this.outputChannel.appendLine(`FallbackOrchestrator analysis failed: ${err.message || err}.`);
                throw err;
            }
        }

        // 'auto' mode
        if (!this.isCurrentlyUsingOllama) {
            try {
                this.outputChannel.appendLine("Running code analysis using FallbackOrchestrator...");
                const responseText = await this.orchestrator.callWithFallback(prompt, this.context);
                await this.updateActiveModel();
                const cleanedText = this.cleanJsonResponse(responseText);
                const parsed = JSON.parse(cleanedText);
                const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
                return this.sanitizeFindings(rawFindings);
            } catch (err: any) {
                this.outputChannel.appendLine(`FallbackOrchestrator analysis failed: ${err.message || err}. Falling back to Ollama...`);
                this.isCurrentlyUsingOllama = true;
                this.startApiCheckTimer();
            }
        }

        await this.checkOllamaAvailability();

        if (this.isCurrentlyUsingOllama && this.ollamaAvailable) {
            const bestModel = this.getBestOllamaModel();
            try {
                this.outputChannel.appendLine(`Running code analysis using Ollama (${bestModel})...`);
                const response = await axios.post('http://localhost:11434/api/generate', {
                    model: bestModel,
                    prompt: prompt,
                    stream: false,
                    format: 'json'
                }, {
                    timeout: 60000
                });
                const responseText = response.data.response;
                const cleanedText = this.cleanJsonResponse(responseText);
                
                let parsed: any;
                try {
                    parsed = JSON.parse(cleanedText);
                } catch (jsonErr) {
                    const startIdx = cleanedText.indexOf('[');
                    const endIdx = cleanedText.lastIndexOf(']');
                    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                        const extracted = cleanedText.substring(startIdx, endIdx + 1);
                        parsed = JSON.parse(extracted);
                    } else {
                        throw jsonErr;
                    }
                }
                
                const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
                return this.sanitizeFindings(rawFindings);
            } catch (err) {
                this.outputChannel.appendLine(`Ollama analysis failed: ${err}. Falling back to FallbackOrchestrator...`);
            }
        }

        try {
            this.outputChannel.appendLine("Running code analysis using FallbackOrchestrator (final fallback)...");
            const responseText = await this.orchestrator.callWithFallback(prompt, this.context);
            await this.updateActiveModel();
            const cleanedText = this.cleanJsonResponse(responseText);
            const parsed = JSON.parse(cleanedText);
            const rawFindings = Array.isArray(parsed) ? parsed : (parsed.findings || []);
            return this.sanitizeFindings(rawFindings);
        } catch (err: any) {
            this.outputChannel.appendLine(`FallbackOrchestrator final fallback analysis failed: ${err.message || err}`);
            throw err;
        }
    }

    public loadPatterns(language: string): { ruleId: string; regex: RegExp; severity: 'low' | 'medium' | 'high' | 'critical'; message: string; suggestedFix?: string; requiresAST?: boolean }[] {
        let rawRules: any[] = [];
        try {
            const rulesPath = path.join(__dirname, '..', 'security_rules.json');
            if (fs.existsSync(rulesPath)) {
                const data = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
                rawRules = data.rules || [];
            } else {
                const workspaceRulesPath = path.join(process.cwd(), 'security_rules.json');
                if (fs.existsSync(workspaceRulesPath)) {
                    const data = JSON.parse(fs.readFileSync(workspaceRulesPath, 'utf-8'));
                    rawRules = data.rules || [];
                }
            }
        } catch (e) {
            // ignore and fallback
        }

        if (rawRules.length === 0) {
            rawRules = StaticallyDefinedRules;
        }

        const filtered = rawRules.filter(r => r.language === 'all' || r.language === language);
        return filtered.map(r => {
            let regexObj: RegExp;
            if (r.regex instanceof RegExp) {
                regexObj = r.regex;
            } else {
                regexObj = new RegExp(r.regex, 'i');
            }
            return {
                ruleId: r.ruleId,
                regex: regexObj,
                severity: r.severity,
                message: r.message,
                suggestedFix: this.getSuggestedFix(r.ruleId, ''),
                requiresAST: !!r.requiresAST
            };
        });
    }

    public getSuggestedFix(ruleId: string, line: string): string | undefined {
        if (ruleId.includes('sqli')) {
            if (ruleId.includes('python')) {
                return "cursor.execute(\"SELECT * FROM users WHERE name = %s\", (user_input,))";
            }
            if (ruleId.includes('javascript')) {
                return "db.query('SELECT * FROM users WHERE name = ?', [userInput])";
            }
            if (ruleId.includes('java')) {
                return "PreparedStatement stmt = conn.prepareStatement(\"SELECT * FROM users WHERE name = ?\");\nstmt.setString(1, userInput);";
            }
            if (ruleId.includes('php')) {
                return "$stmt = $pdo->prepare('SELECT * FROM users WHERE name = ?');\n$stmt->execute([$userInput]);";
            }
            if (ruleId.includes('go')) {
                return "db.Query(\"SELECT * FROM users WHERE name = ?\", userInput)";
            }
            if (ruleId.includes('ruby')) {
                return "User.where(\"name = ?\", params[:name])";
            }
            if (ruleId.includes('rust')) {
                return "sqlx::query(\"SELECT * FROM users WHERE name = $1\").bind(userInput)";
            }
            if (ruleId.includes('csharp')) {
                return "context.Users.FromSqlRaw(\"SELECT * FROM Users WHERE Name = {0}\", userInput)";
            }
            return "Use parameterized queries or prepared statement bindings instead of string concatenation.";
        }
        if (ruleId.includes('rce') || ruleId.includes('eval')) {
            return "Remove eval()/exec() and use safe JSON parsing, predefined function maps, or secure calculations.";
        }
        if (ruleId.includes('cmd-inj')) {
            if (ruleId.includes('python')) {
                return "subprocess.run(['ls', '-l'], shell=False)";
            }
            if (ruleId.includes('javascript')) {
                return "child_process.execFile('node', ['script.js'])";
            }
            return "Avoid running system shell commands. If necessary, use parameter list APIs with shell=False.";
        }
        if (ruleId.includes('deserialization')) {
            if (ruleId.includes('python')) {
                return "json.loads(user_json)";
            }
            if (ruleId.includes('ruby')) {
                return "YAML.safe_load(user_yaml)";
            }
            return "Use safe serialization formats like JSON, Protobuf, or safe yaml loading (e.g. yaml.safe_load).";
        }
        if (ruleId.includes('path-traversal')) {
            return "Normalize paths using built-in path resolution and restrict access to a base directory white list.";
        }
        if (ruleId.includes('xss')) {
            if (ruleId.includes('javascript')) {
                return "element.textContent = userInput; // or DOMPurify.sanitize(userInput)";
            }
            if (ruleId.includes('php')) {
                return "htmlspecialchars($userInput, ENT_QUOTES, 'UTF-8')";
            }
            return "Sanitize dynamic inputs using DOMPurify or escape output characters using htmlspecialchars/escaping helper functions.";
        }
        if (ruleId.includes('ssrf')) {
            return "Implement a domain whitelist for external HTTP requests and avoid direct user input in URL structures.";
        }
        if (ruleId.includes('secrets')) {
            return "Load credentials from environment variables or a secure vault instead of hardcoding them.";
        }
        if (ruleId.includes('crypto')) {
            return "Use modern secure hash algorithms like SHA-256 or bcrypt instead of MD5/SHA-1/DES.";
        }
        if (ruleId.includes('log-injection')) {
            return "Sanitize user inputs by removing carriage returns/newlines before logging.";
        }
        if (ruleId.includes('redirect')) {
            return "Sanitize redirect targets or validate against a strict local path allowlist.";
        }
        if (ruleId.includes('debug')) {
            return "Ensure debug mode is disabled (set to False/production mode) in production environments.";
        }
        return undefined;
    }

    private runStaticAnalysis(code: string, filePath: string, languageId?: string): Finding[] {
        const findings: Finding[] = [];
        const lines = code.split(/\r?\n/);
        
        let language = 'javascript';
        const supportedLanguageIds = [
            'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
            'java', 'python', 'sql', 'php', 'go', 'rust', 'ruby', 'json', 'csharp', 'html',
            'r', 'yaml', 'c', 'cpp', 'dockerfile'
        ];
        const normalizedLangId = languageId ? languageId.toLowerCase() : undefined;
        if (normalizedLangId && supportedLanguageIds.includes(normalizedLangId)) {
            if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(normalizedLangId)) {
                language = 'javascript';
            } else if (['c', 'cpp'].includes(normalizedLangId)) {
                language = 'cpp';
            } else {
                language = normalizedLangId;
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            const base = path.basename(filePath).toLowerCase();
            if (ext === '.java') {
                language = 'java';
            } else if (ext === '.py') {
                language = 'python';
            } else if (ext === '.sql') {
                language = 'sql';
            } else if (ext === '.php') {
                language = 'php';
            } else if (ext === '.go') {
                language = 'go';
            } else if (ext === '.rs') {
                language = 'rust';
            } else if (ext === '.rb') {
                language = 'ruby';
            } else if (ext === '.json') {
                language = 'json';
            } else if (ext === '.cs') {
                language = 'csharp';
            } else if (['.html', '.htm'].includes(ext)) {
                language = 'html';
            } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
                language = 'javascript';
            } else if (['.r', '.rmd'].includes(ext)) {
                language = 'r';
            } else if (['.yaml', '.yml'].includes(ext)) {
                language = 'yaml';
            } else if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
                language = 'cpp';
            } else if (ext === '.dockerfile' || base === 'dockerfile' || base.startsWith('dockerfile.')) {
                language = 'dockerfile';
            } else {
                if (filePath.toLowerCase().includes('untitled')) {
                    language = 'javascript';
                } else {
                    return [];
                }
            }
        }

        const patterns = this.loadPatterns(language);
        const taintTracker = new TaintTracker();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            taintTracker.processLine(line);

            for (const pattern of patterns) {
                let triggered = false;
                if (pattern.requiresAST) {
                    triggered = taintTracker.checkSinkUsage(line, pattern.regex);
                } else {
                    triggered = pattern.regex.test(line);
                }

                if (triggered) {
                    const match = pattern.regex.exec(line);
                    const colStart = match ? match.index + 1 : 1;
                    const colEnd = match ? match.index + match[0].length + 1 : line.length + 1;

                    findings.push({
                        message: pattern.message,
                        severity: pattern.severity,
                        lineStart: lineNum,
                        lineEnd: lineNum,
                        columnStart: colStart,
                        columnEnd: colEnd,
                        ruleId: pattern.ruleId,
                        source: "static-analysis",
                        confidence: pattern.requiresAST ? "high" : "medium",
                        suggestedFix: this.getSuggestedFix(pattern.ruleId, line)
                    });
                }
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

class TaintTracker {
    private taintedVars = new Set<string>();

    processLine(line: string) {
        const sourceRegex = /(?:\b(?:req\.query\.\w+|req\.body\.\w+|request\.args(?:\.get)?|request\.GET|params\[|request\.params|params\.\w+|userInput|user_input|userURL|userJson|username|page)\b|\$(?:_GET|_POST|_REQUEST)\[)/i;
        const assignMatch = /^\s*(?:const|let|var|String|int|double|auto)?\s*(\w+)\s*=\s*(.*)$/.exec(line);
        if (assignMatch) {
            const varName = assignMatch[1];
            const expr = assignMatch[2];
            if (sourceRegex.test(expr)) {
                this.taintedVars.add(varName);
            } else {
                for (const tainted of this.taintedVars) {
                    const regex = new RegExp(`\\b${tainted}\\b`);
                    if (regex.test(expr)) {
                        this.taintedVars.add(varName);
                        break;
                    }
                }
            }
        }
    }

    isTainted(varName: string): boolean {
        return this.taintedVars.has(varName);
    }

    checkSinkUsage(line: string, sinkRegex: RegExp): boolean {
        if (sinkRegex.test(line)) {
            const directSourceRegex = /(?:\b(?:req\.query\.\w+|req\.body\.\w+|request\.args|params\[|userInput|user_input|userURL|userJson|username|page)\b|\$(?:_GET|_POST|_REQUEST)\[)/i;
            if (directSourceRegex.test(line)) {
                return true;
            }
            for (const tainted of this.taintedVars) {
                const regex = new RegExp(`\\b${tainted}\\b`);
                if (regex.test(line)) {
                    return true;
                }
            }
        }
        return false;
    }
}

const StaticallyDefinedRules = [
  {
    "ruleId": "python-rce",
    "language": "python",
    "regex": "\\b(eval|exec|compile|__import__)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Dangerous execution function call detected.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-rce",
    "language": "javascript",
    "regex": "\\b(eval|Function|setTimeout|setInterval)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Use of eval or dynamic code compilers.",
    "requiresAST": true
  },
  {
    "ruleId": "java-rce",
    "language": "java",
    "regex": "\\b(ScriptEngine\\.eval|Runtime\\.exec|ProcessBuilder)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Dynamic code compile or runtime execution detected.",
    "requiresAST": true
  },
  {
    "ruleId": "php-rce",
    "language": "php",
    "regex": "\\b(eval|assert|preg_replace)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Dangerous execution statement or modifier eval.",
    "requiresAST": true
  },
  {
    "ruleId": "ruby-rce",
    "language": "ruby",
    "regex": "\\b(eval|instance_eval|class_eval)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Dynamic script eval detected.",
    "requiresAST": true
  },
  {
    "ruleId": "python-sqli",
    "language": "python",
    "regex": "\\bexecute\\s*\\(\\s*f['\"].*?\\{.*?\\}|\\bexecute\\s*\\(\\s*['\"].*?%s.*?['\"]\\s*%\\s*\\w+",
    "severity": "critical",
    "message": "SQL Injection Risk: Dynamic SQL query execution using string formatting.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-sqli",
    "language": "javascript",
    "regex": "\\b(query|raw)\\s*\\(.*(\\+.*|\\$\\{)",
    "severity": "critical",
    "message": "SQL Injection Risk: String concatenation or template literal detected in dynamic database query.",
    "requiresAST": true
  },
  {
    "ruleId": "java-sqli",
    "language": "java",
    "regex": "\\.executeQuery\\s*\\(.*\\+.*\\)|\\bStatement\\s+\\w+\\s*=\\s*\\w+\\.createStatement\\(\\)",
    "severity": "critical",
    "message": "SQL Injection Risk: Use of non-parameterized statement execution with string concatenation.",
    "requiresAST": true
  },
  {
    "ruleId": "php-sqli",
    "language": "php",
    "regex": "\\b(mysqli_query|query)\\s*\\(.*(\\.|\\$|\\$_GET|\\$_POST)",
    "severity": "critical",
    "message": "SQL Injection Risk: Dynamic string concatenation inside SQL query.",
    "requiresAST": true
  },
  {
    "ruleId": "go-sqli",
    "language": "go",
    "regex": "\\b(Query|QueryRow)\\s*\\(.*(\\+|fmt\\.Sprintf)",
    "severity": "critical",
    "message": "SQL Injection Risk: SQL query constructed via format template or concat.",
    "requiresAST": true
  },
  {
    "ruleId": "ruby-sqli",
    "language": "ruby",
    "regex": "\\.(where|execute)\\s*\\(.*(#\\{)",
    "severity": "critical",
    "message": "SQL Injection Risk: ActiveRecord query constructed using dynamic interpolation.",
    "requiresAST": true
  },
  {
    "ruleId": "rust-sqli",
    "language": "rust",
    "regex": "\\b(query|query_as)\\s*\\(.*(format!)",
    "severity": "critical",
    "message": "SQL Injection Risk: SQLx query formatting macro detected.",
    "requiresAST": true
  },
  {
    "ruleId": "csharp-sqli",
    "language": "csharp",
    "regex": "\\b(FromSqlRaw|SqlCommand)\\s*\\(.*(\\+|\\$)",
    "severity": "critical",
    "message": "SQL Injection Risk: EF core raw SQL or SqlCommand string concatenation.",
    "requiresAST": true
  },
  {
    "ruleId": "python-cmd-inj",
    "language": "python",
    "regex": "\\b(os\\.system|subprocess\\.call|subprocess\\.Popen|os\\.popen)\\b|shell\\s*=\\s*True",
    "severity": "critical",
    "message": "OS Command Injection Risk: Invoking dynamic shell executing environment.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-cmd-inj",
    "language": "javascript",
    "regex": "\\bchild_process\\.(exec|execSync|spawn)\\b",
    "severity": "critical",
    "message": "OS Command Injection Risk: Executing shell command interface.",
    "requiresAST": true
  },
  {
    "ruleId": "java-cmd-inj",
    "language": "java",
    "regex": "\\bRuntime\\.getRuntime\\(\\)\\.exec\\b|\\bnew\\s+ProcessBuilder\\b",
    "severity": "critical",
    "message": "OS Command Injection Risk: Spawning subprocesses with dynamic input vectors.",
    "requiresAST": true
  },
  {
    "ruleId": "php-cmd-inj",
    "language": "php",
    "regex": "\\b(shell_exec|system|exec|passthru)\\b",
    "severity": "critical",
    "message": "OS Command Injection Risk: Interactive system shell call.",
    "requiresAST": true
  },
  {
    "ruleId": "go-cmd-inj",
    "language": "go",
    "regex": "\\bexec\\.Command\\b",
    "severity": "critical",
    "message": "OS Command Injection Risk: Dynamic executable execution.",
    "requiresAST": true
  },
  {
    "ruleId": "ruby-cmd-inj",
    "language": "ruby",
    "regex": "`.*?#\\{.*?\\}.*?`|\\bsystem\\s*\\(.*#\\{",
    "severity": "critical",
    "message": "OS Command Injection Risk: Shell command construction with dynamic interpolation.",
    "requiresAST": true
  },
  {
    "ruleId": "rust-cmd-inj",
    "language": "rust",
    "regex": "\\bCommand::new\\s*\\(\\s*(?!&?['\"])\\w+|\\.arg(?:s)?\\s*\\(\\s*(?!&?['\"])\\w+",
    "severity": "critical",
    "message": "OS Command Injection Risk: Command spawned with dynamic variable arguments.",
    "requiresAST": false
  },
  {
    "ruleId": "python-deserialization",
    "language": "python",
    "regex": "\\b(pickle\\.loads|pickle\\.load|yaml\\.load|torch\\.load)\\b",
    "severity": "critical",
    "message": "Unsafe Deserialization Risk: Reconstructing serialized objects can run arbitrary code.",
    "requiresAST": false
  },
  {
    "ruleId": "java-deserialization",
    "language": "java",
    "regex": "\\b(ObjectInputStream\\.readObject|XmlDecoder\\.readObject)\\b",
    "severity": "critical",
    "message": "Unsafe Deserialization Risk: Deserialization of arbitrary streams can lead to remote code execution.",
    "requiresAST": false
  },
  {
    "ruleId": "php-deserialization",
    "language": "php",
    "regex": "\\b(unserialize|unserialize_callback_func)\\b",
    "severity": "critical",
    "message": "Unsafe Deserialization Risk: PHP Object Injection vulnerability.",
    "requiresAST": false
  },
  {
    "ruleId": "ruby-deserialization",
    "language": "ruby",
    "regex": "\\b(Marshal\\.load|YAML\\.load)\\b",
    "severity": "critical",
    "message": "Unsafe Deserialization Risk: Marshalling or unsafe YAML loaders.",
    "requiresAST": false
  },
  {
    "ruleId": "python-path-traversal",
    "language": "python",
    "regex": "\\bopen\\s*\\(\\s*f['\"].*?\\{.*?\\}|\\bopen\\s*\\(\\s*(?!['\"])\\w+",
    "severity": "critical",
    "message": "Path Traversal Risk: Opening files dynamically with user input.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-path-traversal",
    "language": "javascript",
    "regex": "\\bfs\\.(readFileSync|createReadStream|writeFile|writeFileSync)\\b",
    "severity": "critical",
    "message": "Path Traversal Risk: Accessing file system via dynamic paths.",
    "requiresAST": true
  },
  {
    "ruleId": "java-path-traversal",
    "language": "java",
    "regex": "\\bnew\\s+(FileInputStream|FileReader|File)\\b|\\bFiles\\.readAllBytes\\b",
    "severity": "critical",
    "message": "Path Traversal Risk: Instantiating filesystem loaders with variables.",
    "requiresAST": true
  },
  {
    "ruleId": "php-path-traversal",
    "language": "php",
    "regex": "\\b(include|require|file_get_contents|file_put_contents)\\b",
    "severity": "critical",
    "message": "Path Traversal / Local File Inclusion Risk: Loading dynamic files from variable sources.",
    "requiresAST": true
  },
  {
    "ruleId": "go-path-traversal",
    "language": "go",
    "regex": "\\b(ioutil\\.ReadFile|os\\.Open)\\b",
    "severity": "critical",
    "message": "Path Traversal Risk: dynamic file access using parameters.",
    "requiresAST": true
  },
  {
    "ruleId": "rust-path-traversal",
    "language": "rust",
    "regex": "\\bfs::(?:read|read_to_string|File::open)\\s*\\(\\s*(?!&?['\"])\\w+",
    "severity": "critical",
    "message": "Path Traversal Risk: File read method executed using dynamic path variable.",
    "requiresAST": false
  },
  {
    "ruleId": "csharp-path-traversal",
    "language": "csharp",
    "regex": "\\bFile\\.(ReadAllText|OpenRead)\\b",
    "severity": "critical",
    "message": "Path Traversal Risk: Opening filesystem components dynamically.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-xss",
    "language": "javascript",
    "regex": "\\b(innerHTML|outerHTML|document\\.write|insertAdjacentHTML|dangerouslySetInnerHTML)\\b",
    "severity": "high",
    "message": "XSS (Cross-Site Scripting) Risk: Raw insertion of untrusted string into DOM element.",
    "requiresAST": true
  },
  {
    "ruleId": "angular-xss",
    "language": "javascript",
    "regex": "\\b(bypassSecurityTrustHtml|bypassSecurityTrustUrl|bypassSecurityTrustScript)\\b",
    "severity": "high",
    "message": "XSS Risk: Explicitly bypassing security trust constraints in Angular.",
    "requiresAST": true
  },
  {
    "ruleId": "vue-xss",
    "language": "javascript",
    "regex": "v-html\\s*=|\\.\\$refs\\..*?\\.innerHTML",
    "severity": "high",
    "message": "XSS Risk: Raw HTML render directive v-html in Vue template.",
    "requiresAST": true
  },
  {
    "ruleId": "html-xss",
    "language": "html",
    "regex": "<script\\s+[^>]*src\\s*=|\\bonload\\s*=|\\bonerror\\s*=",
    "severity": "high",
    "message": "XSS Risk: Dynamic inline event handlers or scripts.",
    "requiresAST": false
  },
  {
    "ruleId": "php-xss",
    "language": "php",
    "regex": "\\b(echo|print)\\b\\s+(?!\\bhtmlspecialchars\\b)(?!\\bhtmlentities\\b)\\$",
    "severity": "high",
    "message": "XSS Risk: echo/print outputs raw variable directly without escaping.",
    "requiresAST": true
  },
  {
    "ruleId": "python-ssrf",
    "language": "python",
    "regex": "\\b(requests\\.get|requests\\.post|urllib\\.request\\.urlopen|httpx\\.get)\\b",
    "severity": "high",
    "message": "SSRF (Server-Side Request Forgery) Risk: Loading external URLs dynamically.",
    "requiresAST": true
  },
  {
    "ruleId": "javascript-ssrf",
    "language": "javascript",
    "regex": "\\b(fetch|axios\\.get|axios\\.post|http\\.get|https\\.get)\\b",
    "severity": "high",
    "message": "SSRF Risk: Network connection targets dynamic URL parameter.",
    "requiresAST": true
  },
  {
    "ruleId": "java-ssrf",
    "language": "java",
    "regex": "\\b(HttpClient\\.send|URL\\.openStream)\\b",
    "severity": "high",
    "message": "SSRF Risk: Server requests network resources directly.",
    "requiresAST": true
  },
  {
    "ruleId": "go-ssrf",
    "language": "go",
    "regex": "\\b(http\\.Get|client\\.Do)\\b",
    "severity": "high",
    "message": "SSRF Risk: Web request target controlled by parameters.",
    "requiresAST": true
  },
  {
    "ruleId": "php-ssrf",
    "language": "php",
    "regex": "\\b(file_get_contents|curl_exec)\\b",
    "severity": "high",
    "message": "SSRF Risk: File or CURL resource retrieved using variables.",
    "requiresAST": true
  },
  {
    "ruleId": "ruby-ssrf",
    "language": "ruby",
    "regex": "\\b(Net::HTTP\\.get|open)\\b",
    "severity": "high",
    "message": "SSRF Risk: URL client requests dynamic endpoints.",
    "requiresAST": true
  },
  {
    "ruleId": "all-hardcoded-secrets",
    "language": "all",
    "regex": "sk_live_[a-zA-Z0-9]{24}|sk_test_[a-zA-Z0-9]{24}|AIzaSy[a-zA-Z0-9_-]{33}|ghp_[a-zA-Z0-9]{36}|xox[b-p]-[a-zA-Z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN RSA PRIVATE KEY-----|password\\s*=\\s*['\"][^'\"]+['\"]|api[_-]?key\\s*=\\s*['\"][^'\"]+['\"]|secret\\s*=\\s*['\"][^'\"]+['\"]|token\\s*=\\s*['\"][^'\"]+['\"]",
    "severity": "high",
    "message": "Hardcoded Secrets: Potential private key, API token, or secret credentials.",
    "requiresAST": false
  },
  {
    "ruleId": "all-weak-crypto",
    "language": "all",
    "regex": "\\b(md5|sha1|DES|RC4)\\b|MessageDigest\\.getInstance\\(\"(MD5|SHA-1)\"\\)|createHash\\('(md5|sha1)'\\)",
    "severity": "high",
    "message": "Weak Cryptography: MD5, SHA-1, DES or RC4 encryption detected.",
    "requiresAST": false
  },
  {
    "ruleId": "all-log-injection",
    "language": "all",
    "regex": "\\b(log|logging|console)\\.(info|error|warn|debug|log|Printf|println)\\b\\s*\\(.*\\+.*\\)",
    "severity": "medium",
    "message": "Log Injection Risk: Outputting unescaped dynamic parameters into application log structures.",
    "requiresAST": true
  },
  {
    "ruleId": "nosql-injection",
    "language": "javascript",
    "regex": "\\$where|\\$regex|BasicDBObject",
    "severity": "medium",
    "message": "NoSQL Injection Risk: Use of dynamic conditions inside NoSQL queries.",
    "requiresAST": true
  },
  {
    "ruleId": "xxe-injection",
    "language": "java",
    "regex": "DocumentBuilderFactory|xml\\.etree\\.ElementTree|simplexml_load_string|XmlDocument",
    "severity": "medium",
    "message": "XXE Injection Risk: Parsers should disable external entity processing.",
    "requiresAST": false
  },
  {
    "ruleId": "crlf-injection",
    "language": "all",
    "regex": "\\.setHeader\\(|header\\(|response\\.headers",
    "severity": "medium",
    "message": "CRLF Injection / HTTP Header Injection: Setting dynamic response headers.",
    "requiresAST": true
  },
  {
    "ruleId": "open-redirect",
    "language": "all",
    "regex": "\\b(redirect|res\\.redirect|HttpResponseRedirect)\\b\\s*\\(",
    "severity": "medium",
    "message": "Open Redirect Risk: Setting navigation target dynamically.",
    "requiresAST": true
  },
  {
    "ruleId": "debug-mode-on",
    "language": "all",
    "regex": "\\bDEBUG\\s*=\\s*True\\b|\\bdebug\\s*=\\s*True\\b|app\\.set\\('env',\\s*'development'\\)|display_errors\\s*,\\s*1|spring\\.profiles\\.active\\s*=\\s*dev",
    "severity": "low",
    "message": "Security Warning: Debug configurations active.",
    "requiresAST": false
  },
  {
    "ruleId": "verbose-errors",
    "language": "all",
    "regex": "traceback\\.format_exc\\(\\)|errorHandler",
    "severity": "low",
    "message": "Security Warning: Stack traces and detailed exception context exposed.",
    "requiresAST": false
  },
  {
    "ruleId": "commented-keys",
    "language": "all",
    "regex": "TODO:\\s+change\\s+key|//\\s*secret\\s*=\\s*['\"]|#\\s*password\\s*=\\s*\\w+",
    "severity": "low",
    "message": "Commented Key Warning: Developer comments may disclose secret placeholder keys.",
    "requiresAST": false
  },
  {
    "ruleId": "csharp-cmd-inj",
    "language": "csharp",
    "regex": "\\bProcess\\.Start\\b",
    "severity": "critical",
    "message": "Command Injection Risk: Spawning subprocesses or shell executes with dynamic parameter builders.",
    "requiresAST": true
  },
  {
    "ruleId": "sql-xp-cmdshell",
    "language": "sql",
    "regex": "\\bxp_cmdshell\\b",
    "severity": "critical",
    "message": "SQL Command Execution Risk: Invoking xp_cmdshell allows remote command execution.",
    "requiresAST": false
  },
  {
    "ruleId": "sql-no-where",
    "language": "sql",
    "regex": "\\b(UPDATE|DELETE)\\b\\s+(?!.*?\\bWHERE\\b)",
    "severity": "critical",
    "message": "Dangerous SQL: UPDATE or DELETE statement without a WHERE clause can modify or delete all rows.",
    "requiresAST": false
  },
  {
    "ruleId": "html-script-http",
    "language": "html",
    "regex": "<script\\s+[^>]*src\\s*=\\s*['\"]http://",
    "severity": "high",
    "message": "Insecure Resource Loading: Loading scripts over insecure HTTP protocol.",
    "requiresAST": false
  },
  {
    "ruleId": "html-form-http",
    "language": "html",
    "regex": "<form\\s+[^>]*action\\s*=\\s*['\"]http://",
    "severity": "medium",
    "message": "Insecure Form Action: Form submissions targeted to insecure HTTP endpoint.",
    "requiresAST": false
  },
  {
    "ruleId": "rust-unsafe-block",
    "language": "rust",
    "regex": "\\bunsafe\\s*\\{",
    "severity": "medium",
    "message": "Rust Unsafe Block: Use of unsafe code blocks should be minimized and audited.",
    "requiresAST": false
  },
  {
    "ruleId": "r-rce",
    "language": "r",
    "regex": "\\b(eval|parse|system|system2|shell)\\b\\s*\\(",
    "severity": "critical",
    "message": "Arbitrary Code Execution Risk: Dynamic code parsing or system execution command detected.",
    "requiresAST": false
  },
  {
    "ruleId": "r-path-traversal",
    "language": "r",
    "regex": "\\b(read\\.csv|read\\.table|write\\.csv|write\\.table|load|save|readLines|writeLines)\\b\\s*\\(.*?(?!['\"])\\w+",
    "severity": "critical",
    "message": "Path Traversal Risk: File operations using dynamic variable paths.",
    "requiresAST": true
  },
  {
    "ruleId": "r-weak-ssl",
    "language": "r",
    "regex": "ssl_verifypeer\\s*=\\s*(?:FALSE|0)",
    "severity": "high",
    "message": "Insecure Transport: Disabling SSL certificate validation in HTTP connection.",
    "requiresAST": false
  },
  {
    "ruleId": "yaml-unsafe-deserialization",
    "language": "yaml",
    "regex": "!!python/object/apply|!!python/object/new|!!python/object|!unsafe|!load",
    "severity": "critical",
    "message": "YAML Unsafe Deserialization: Found tags indicating potential arbitrary code execution on deserialization.",
    "requiresAST": false
  },
  {
    "ruleId": "yaml-k8s-privilege",
    "language": "yaml",
    "regex": "privileged:\\s*true|hostNetwork:\\s*true|hostPID:\\s*true",
    "severity": "high",
    "message": "Kubernetes Privilege Escalation: Pod configuration enables host access or privileged execution.",
    "requiresAST": false
  },
  {
    "ruleId": "yaml-hardcoded-secrets",
    "language": "yaml",
    "regex": "(api_key|password|secret|token|passphrase):\\s*['\"][a-zA-Z0-9_-]+['\"]",
    "severity": "high",
    "message": "Hardcoded Secret: Plaintext sensitive credentials found in configuration.",
    "requiresAST": false
  },
  {
    "ruleId": "cpp-buffer-overflow",
    "language": "cpp",
    "regex": "\\b(strcpy|strcat|sprintf|vsprintf|gets)\\b\\s*\\(",
    "severity": "critical",
    "message": "Buffer Overflow Risk: Use of unsafe string function without boundary verification.",
    "requiresAST": false
  },
  {
    "ruleId": "cpp-cmd-inj",
    "language": "cpp",
    "regex": "\\b(system|popen|execvp|execlp|execle|execv|execl)\\b\\s*\\(",
    "severity": "critical",
    "message": "OS Command Injection Risk: Invoking OS shell or command execution with potential unvalidated arguments.",
    "requiresAST": true
  },
  {
    "ruleId": "cpp-integer-overflow",
    "language": "cpp",
    "regex": "\\b(malloc|calloc|realloc)\\b\\s*\\(\\s*\\w+\\s*[\\*+]\\s*\\w+\\s*\\)",
    "severity": "high",
    "message": "Integer Overflow to Buffer Overflow: Direct multiplication or addition inside allocation functions can cause overflow.",
    "requiresAST": false
  },
  {
    "ruleId": "cpp-format-string",
    "language": "cpp",
    "regex": "\\b(printf|fprintf|sprintf|snprintf)\\b\\s*\\(\\s*(?!['\"])\\w+\\s*\\)",
    "severity": "critical",
    "message": "Format String Vulnerability: Directly passing non-constant/user-controlled variable as format string.",
    "requiresAST": true
  },
  {
    "ruleId": "dockerfile-root-user",
    "language": "dockerfile",
    "regex": "^\\s*USER\\s+root\\b",
    "severity": "medium",
    "message": "Security Best Practice: Running container with root permissions increases vulnerability impact.",
    "requiresAST": false
  },
  {
    "ruleId": "dockerfile-curl-sh",
    "language": "dockerfile",
    "regex": "curl\\s+.*?\\|\\s*(?:bash|sh)\\b",
    "severity": "high",
    "message": "Remote Code Execution Risk: Downloading and executing untrusted scripts directly from the internet.",
    "requiresAST": false
  },
  {
    "ruleId": "dockerfile-add-instruction",
    "language": "dockerfile",
    "regex": "^\\s*ADD\\s+",
    "severity": "low",
    "message": "Security Best Practice: Prefer COPY over ADD unless extracting local archives or remote URLs.",
    "requiresAST": false
  },
  {
    "ruleId": "dockerfile-expose-ssh",
    "language": "dockerfile",
    "regex": "EXPOSE\\s+22\\b",
    "severity": "high",
    "message": "Security Risk: Exposing SSH port 22 inside containers increases attack surface.",
    "requiresAST": false
  }
];

