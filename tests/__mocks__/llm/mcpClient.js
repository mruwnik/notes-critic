module.exports = {
  MCPClient: jest.fn().mockImplementation(() => ({
    getTools: jest.fn(() => Promise.resolve([])),
    getName: jest.fn(() => 'mock-server'),
    getServerUrl: jest.fn(() => 'http://mock-server'),
    getApiKey: jest.fn(() => 'mock-key')
  })),
  MCPManager: jest.fn().mockImplementation(() => ({
    getEnabledServers: jest.fn(() => []),
    getClient: jest.fn(() => undefined),
    getAllClients: jest.fn(() => []),
    getAllTools: jest.fn(() => Promise.resolve([])),
    toolCall: jest.fn(() => Promise.resolve({})),
    getTools: jest.fn(() => Promise.resolve([]))
  })),
  Tool: jest.fn()
};