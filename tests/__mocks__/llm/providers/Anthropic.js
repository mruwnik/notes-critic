class MockAnthropicProvider {
  constructor() {}
  
  async *callLLM() {
    yield { type: 'content', content: 'Mock Anthropic response' };
  }
  
  async makeTitle() {
    return 'Mock Title';
  }
  
  static async testApiKey(apiKey, app) {
    const { requestUrl } = require('obsidian');
    try {
      const response = await requestUrl({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'test' }],
          stream: false
        }),
        throw: false
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

module.exports = {
  __esModule: true,
  default: MockAnthropicProvider
};