import express from 'express';
import { TaintFlowEngine, SecretStorage, Settings } from '../core/taintflow-engine.js';

class EnvSecretStorage implements SecretStorage {
  async get(key: string): Promise<string | undefined> {
    const cleanKey = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase() + '_API_KEY';
    return process.env[cleanKey] || process.env[cleanKey.replace('TAINTFLOW_', '')];
  }
  async store(key: string, value: string): Promise<void> {
    const cleanKey = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase() + '_API_KEY';
    process.env[cleanKey] = value;
  }
}

class EnvSettings implements Settings {
  get<T>(key: string, defaultValue?: T): T {
    const envValName = key.replace(/\./g, '_').toUpperCase();
    if (process.env[envValName] !== undefined) {
      return process.env[envValName] as any;
    }
    if (key === 'providers') {
      return { google: true, groq: true, anthropic: true } as any;
    }
    if (key.endsWith('.priority')) {
      const provider = key.split('.')[0];
      if (provider === 'google') return 10 as any;
      if (provider === 'groq') return 20 as any;
      if (provider === 'anthropic') return 30 as any;
    }
    return defaultValue as T;
  }
}

const loggerShim = {
  appendLine: (msg: string) => {
    console.log(`[TaintFlow+ Engine] ${msg}`);
  }
};

const engine = new TaintFlowEngine(new EnvSecretStorage(), new EnvSettings(), loggerShim);

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await engine.initialize();
    res.json({
      status: 'ok',
      ollama: engine.ollamaAvailable,
      activeModel: engine.activeModel
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to initialize engine',
      error: String(error)
    });
  }
});

app.post('/verify', async (req, res) => {
  const { code, filePath } = req.body;
  if (typeof code !== 'string') {
    res.status(400).json({ error: "Missing or invalid required 'code' body parameter." });
    return;
  }

  try {
    await engine.initialize();
    const findings = await engine.analyzeCode(code, filePath || 'temporary-file.ts');
    res.json({ findings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

const port = process.env.PORT || 9876;
app.listen(port, () => {
  console.log(`TaintFlow+ HTTP server listening on port ${port}`);
});
