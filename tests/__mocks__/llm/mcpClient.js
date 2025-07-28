// Mock MCPClient to avoid constructor async issues

class MockMCPClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.apiKey = global.localStorage ? global.localStorage.getItem(`oauth_access_token_${serverConfig.url}`) : null;
    this.tools = [];
    this.cachedTools = null; // Add caching support
    // Don't call getTools in constructor to avoid async issues
  }

  isEnabled() {
    return this.serverConfig.enabled;
  }

  isAuthenticated() {
    return this.apiKey !== null && this.apiKey !== undefined;
  }

  getName() {
    try {
      const url = new URL(this.serverConfig.url);
      return url.hostname.replace(/\./g, "-");
    } catch {
      return this.serverConfig.name || this.serverConfig.id;
    }
  }

  getServerUrl() {
    return this.serverConfig.url;
  }

  getServerId() {
    return this.serverConfig.id;
  }

  getServerConfig() {
    return this.serverConfig;
  }

  getApiKey() {
    return this.apiKey;
  }

  async getTools(force = false) {
    // Implement caching - return cached tools if available and not forcing refresh
    if (!force && this.cachedTools) {
      return this.cachedTools;
    }
    
    // Mock implementation that uses the streaming mock
    const streamingMock = require('./streaming');
    
    if (!this.isAuthenticated()) {
      throw new Error('No response from MCP server');
    }

    if (!this.isEnabled()) {
      throw new Error('No response from MCP server');
    }

    try {
      const config = {
        url: `${this.serverConfig.url}/tools/list`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: {
          jsonrpc: '2.0',
          id: Math.floor(Math.random() * 1000000),
          method: 'tools/list'
        }
      };

      const stream = streamingMock.streamFromEndpoint(config);
      let response = null;

      for await (const chunk of stream) {
        if (chunk && chunk.result && chunk.result.tools) {
          response = chunk;
          break;
        }
      }

      if (!response || !response.result || !response.result.tools) {
        throw new Error('No response from MCP server');
      }

      const tools = response.result.tools.map(tool => ({
        ...tool,
        serverId: this.serverConfig.id
      }));

      this.tools = tools;
      this.cachedTools = tools; // Cache the tools
      return tools;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = {
  __esModule: true,
  MCPClient: MockMCPClient,
  MCPManager: jest.fn().mockImplementation(() => ({
    getEnabledServers: jest.fn(() => []),
    getClient: jest.fn(() => undefined),
    getAllClients: jest.fn(() => []),
    getAllTools: jest.fn(() => Promise.resolve([])),
    toolCall: jest.fn(() => Promise.resolve({})),
    getTools: jest.fn(() => Promise.resolve([]))
  })),
  Tool: {} // Export Tool interface as empty object
};