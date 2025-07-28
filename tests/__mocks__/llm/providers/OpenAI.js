class MockOpenAIProvider {
  constructor() {}
  
  async *callLLM() {
    yield { type: 'content', content: 'Mock OpenAI response' };
  }
  
  async makeTitle() {
    return 'Mock Title';
  }
  
  static async testApiKey(apiKey, app) {
    const { requestUrl } = require('obsidian');
    try {
      const response = await requestUrl({
        url: 'https://api.openai.com/v1/responses',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
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
  default: MockOpenAIProvider
};