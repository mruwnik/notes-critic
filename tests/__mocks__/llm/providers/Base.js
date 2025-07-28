class MockBaseLLMProvider {
  constructor() {}
  
  async *callLLM() {
    yield { type: 'content', content: 'Mock Base response' };
  }
  
  async makeTitle() {
    return 'Mock Title';
  }
}

module.exports = MockBaseLLMProvider;