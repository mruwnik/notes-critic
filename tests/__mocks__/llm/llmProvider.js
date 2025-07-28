// Mock LLMProvider that can be dynamically mocked by Jest
const MockLLMProvider = jest.fn().mockImplementation((settings, app) => {
  return {
    settings,
    app,
    callLLM: jest.fn(async function* (messages, systemPrompt) {
      yield { type: 'thinking', content: 'thinking...' };
      yield { type: 'content', content: 'response content' };
      yield { type: 'done', content: '', isComplete: true };
    }),
    updateSettings: jest.fn((settings, app) => {
      this.settings = settings;
      this.app = app;
    }),
    runToolCall: jest.fn(async (chunk) => {
      return { success: true };
    }),
    makeTitle: jest.fn(async () => 'Mock Title')
  };
});

MockLLMProvider.testApiKey = jest.fn(async (apiKey, provider, app) => {
  return apiKey === 'valid-key';
});

module.exports = {
  LLMProvider: MockLLMProvider
};