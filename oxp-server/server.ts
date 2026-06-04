import express from 'express';
import { VeriBuildEngine } from '../src/veribuild-core.js';

class MockSecretStorage {
  async get(key: string): Promise<string | undefined> {
    const envKey = key.toUpperCase().replace(/\./g, '_');
    return process.env[envKey] || process.env[envKey.replace('VERIBUILD_', '')];
  }
  async store(key: string, value: string): Promise<void> {}
  async delete(key: string): Promise<void> {}
}

const mockSecrets = new MockSecretStorage();
const mockContext: any = {
  secrets: mockSecrets
};

const mockOutputChannel: any = {
  appendLine: (value: string) => {
    console.log(`[VeriBuildEngine] ${value}`);
  }
};

const engine = new VeriBuildEngine(mockContext, mockOutputChannel);

const app = express();
app.use(express.json());

// GET /health returns { status: 'ok', ollama: boolean }
app.get('/health', async (req, res) => {
  try {
    await engine.initialize();
    res.json({
      status: 'ok',
      ollama: engine.ollamaAvailable
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to initialize engine',
      error: String(error)
    });
  }
});

// POST /verify expects JSON { code, filePath }, returns { findings: [...] }
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
  console.log(`VeriBuild HTTP server listening on port ${port}`);
});
