module.exports = {
  MCPClient: jest.fn().mockImplementation(() => ({
    getTools: jest.fn(() => Promise.resolve([])),
    getName: jest.fn(() => 'mock-server'),
    getServerUrl: jest.fn(() => 'http://mock-server'),
    getApiKey: jest.fn(() => 'mock-key')
  })),
  Tool: jest.fn()
};