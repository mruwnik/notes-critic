// Create async generator for mocking streaming responses
const createMockAsyncGenerator = (data = []) => {
  return (async function* () {
    for (const item of data) {
      yield item;
    }
  })();
};

// Default mock implementation that returns tools for MCP client constructor
const mockStreamFromEndpoint = jest.fn().mockImplementation((config) => {
  // Always return a valid response to prevent constructor crashes
  return createMockAsyncGenerator([{
    result: {
      tools: [{
        name: 'default-mock-tool',
        description: 'Default mock tool',
        inputSchema: { type: 'object', properties: {} }
      }]
    }
  }]);
});

module.exports = {
  streamFromEndpoint: mockStreamFromEndpoint,
  streamResponse: jest.fn(),
  callRequestUrl: jest.fn(),
  callEndpoint: jest.fn(),
  streamJsonObjects: jest.fn(),
  HttpConfig: jest.fn(),
  // Export for test access
  __mockStreamFromEndpoint: mockStreamFromEndpoint,
  __createMockAsyncGenerator: createMockAsyncGenerator
};