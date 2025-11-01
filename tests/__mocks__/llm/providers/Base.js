class MockBaseLLMProvider {
  constructor(settings = {}, app = {}) {
    this.settings = settings;
    this.app = app;
  }

  async *callLLM() {
    yield { type: 'content', content: 'Mock Base response' };
  }

  async makeTitle() {
    return 'Mock Title';
  }

  updateSettings(settings) {
    this.settings = settings;
  }
}

module.exports = {
  __esModule: true,
  BaseLLMProvider: MockBaseLLMProvider,
  default: MockBaseLLMProvider
};
