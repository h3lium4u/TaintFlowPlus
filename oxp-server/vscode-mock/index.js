module.exports = {
  workspace: {
    getConfiguration: (section) => ({
      get: (key, defaultValue) => {
        const envKey = `VERIBUILD_${section ? section.toUpperCase() + '_' : ''}${key.toUpperCase().replace(/\./g, '_')}`;
        const envVal = process.env[envKey];
        if (envVal !== undefined) {
          try {
            return JSON.parse(envVal);
          } catch {
            return envVal;
          }
        }
        if (key === 'providers') {
          return ['openai', 'anthropic', 'google', 'groq'];
        }
        return defaultValue;
      }
    })
  },
  commands: {
    executeCommand: async () => {}
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => {}
    })
  }
};
