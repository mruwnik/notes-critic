// Mock LLMProvider
class MockLLMProvider {
  constructor(settings, app) {
    this.settings = settings;
    this.app = app;
  }

  async *callLLM(messages, systemPrompt) {
    yield { type: 'thinking', content: 'thinking...' };
    yield { type: 'content', content: 'response content' };
    yield { type: 'done', content: '', isComplete: true };
  }

  updateSettings(settings, app) {
    this.settings = settings;
    this.app = app;
  }

  async runToolCall(chunk) {
    return { success: true };
  }

  static async testApiKey(apiKey, provider, app) {
    return apiKey === 'valid-key';
  }
}

module.exports = {
  LLMProvider: MockLLMProvider
};