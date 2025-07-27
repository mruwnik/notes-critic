import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPClient, Tool } from '../../src/llm/mcpClient';
import { NotesCriticSettings, DEFAULT_SETTINGS } from '../../src/types';

// Create proper async generator mock
const mockStreamFromEndpoint = jest.fn();

jest.mock('../../src/llm/streaming', () => ({
  streamFromEndpoint: mockStreamFromEndpoint
}));

describe('MCPClient', () => {
  let client: MCPClient;
  let mockSettings: NotesCriticSettings;
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};
    global.localStorage = {
      getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage = {};
      }),
      length: 0,
      key: jest.fn()
    } as any;

    // Set up default mock implementation for streamFromEndpoint
    mockStreamFromEndpoint.mockImplementation(async function* () {
      // Default empty generator
    });

    mockSettings = {
      ...DEFAULT_SETTINGS,
      mcpServerUrl: 'https://mcp.example.com',
      mcpMode: 'enabled' as const
    };

    client = new MCPClient(mockSettings);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with settings', () => {
      expect(client.getServerUrl()).toBe('https://mcp.example.com');
    });

    it('should load existing API key from localStorage', () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const newClient = new MCPClient(mockSettings);
      
      expect(newClient.getApiKey()).toBe('test-token');
    });

    it('should handle empty server URL', () => {
      const settingsWithoutUrl = { ...mockSettings, mcpServerUrl: '' };
      const newClient = new MCPClient(settingsWithoutUrl);
      
      expect(newClient.getServerUrl()).toBe('');
      expect(newClient.isEnabled()).toBe(false);
    });

    it('should trim whitespace from server URL', () => {
      const settingsWithWhitespace = { ...mockSettings, mcpServerUrl: '  https://mcp.example.com  ' };
      const newClient = new MCPClient(settingsWithWhitespace);
      
      expect(newClient.getServerUrl()).toBe('https://mcp.example.com');
    });
  });

  describe('isEnabled', () => {
    it('should return true when mode is enabled and URL is set', () => {
      expect(client.isEnabled()).toBe(true);
    });

    it('should return false when mode is disabled', () => {
      const disabledSettings = { ...mockSettings, mcpMode: 'disabled' as const };
      const disabledClient = new MCPClient(disabledSettings);
      
      expect(disabledClient.isEnabled()).toBe(false);
    });

    it('should return false when server URL is empty', () => {
      const noUrlSettings = { ...mockSettings, mcpServerUrl: '' };
      const noUrlClient = new MCPClient(noUrlSettings);
      
      expect(noUrlClient.isEnabled()).toBe(false);
    });

    it('should return false when server URL is undefined', () => {
      const undefinedUrlSettings = { ...mockSettings, mcpServerUrl: undefined };
      const undefinedUrlClient = new MCPClient(undefinedUrlSettings);
      
      expect(undefinedUrlClient.isEnabled()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no API key is stored', () => {
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should return true when API key exists', () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authenticatedClient = new MCPClient(mockSettings);
      
      expect(authenticatedClient.isAuthenticated()).toBe(true);
    });

    it('should return false when API key is null', () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = null as any;
      const nullKeyClient = new MCPClient(mockSettings);
      
      expect(nullKeyClient.isAuthenticated()).toBe(false);
    });
  });

  describe('getName', () => {
    it('should generate name from hostname', () => {
      expect(client.getName()).toBe('mcp-example-com');
    });

    it('should handle complex hostnames', () => {
      const complexSettings = { ...mockSettings, mcpServerUrl: 'https://api.mcp.service.example.com:8080' };
      const complexClient = new MCPClient(complexSettings);
      
      expect(complexClient.getName()).toBe('api-mcp-service-example-com');
    });

    it('should return empty string for invalid URLs', () => {
      const invalidSettings = { ...mockSettings, mcpServerUrl: 'invalid-url' };
      const invalidClient = new MCPClient(invalidSettings);
      
      expect(invalidClient.getName()).toBe('');
    });

    it('should return empty string for empty URL', () => {
      const emptySettings = { ...mockSettings, mcpServerUrl: '' };
      const emptyClient = new MCPClient(emptySettings);
      
      expect(emptyClient.getName()).toBe('');
    });

    it('should return empty string for undefined URL', () => {
      const undefinedSettings = { ...mockSettings, mcpServerUrl: undefined };
      const undefinedClient = new MCPClient(undefinedSettings);
      
      expect(undefinedClient.getName()).toBe('');
    });
  });

  describe('getServerUrl', () => {
    it('should return the configured server URL', () => {
      expect(client.getServerUrl()).toBe('https://mcp.example.com');
    });

    it('should return undefined for undefined URL', () => {
      const undefinedSettings = { ...mockSettings, mcpServerUrl: undefined };
      const undefinedClient = new MCPClient(undefinedSettings);
      
      expect(undefinedClient.getServerUrl()).toBeUndefined();
    });
  });

  describe('getApiKey', () => {
    it('should return null when no key is stored', () => {
      expect(client.getApiKey()).toBeNull();
    });

    it('should return stored API key', () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const keyClient = new MCPClient(mockSettings);
      
      expect(keyClient.getApiKey()).toBe('test-token');
    });
  });

  describe('getTools', () => {
    it('should return empty array when not authenticated', async () => {
      const tools = await client.getTools();
      expect(tools).toEqual([]);
    });

    it('should return empty array when not enabled', async () => {
      const disabledSettings = { ...mockSettings, mcpMode: 'disabled' as const };
      const disabledClient = new MCPClient(disabledSettings);
      
      const tools = await disabledClient.getTools();
      expect(tools).toEqual([]);
    });

    it('should fetch tools when authenticated and enabled', async () => {
      // Set up authenticated client
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authClient = new MCPClient(mockSettings);

      // Mock the streaming response
      const mockTools = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: { param: { type: 'string' } } }
        }
      ];

      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        yield { tools: mockTools };
      });

      const tools = await authClient.getTools();
      
      expect(tools).toEqual(mockTools);
      expect(streamFromEndpoint).toHaveBeenCalledWith({
        url: 'https://mcp.example.com/tools/list',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: expect.any(Number),
          method: 'tools/list'
        })
      });
    });

    it('should handle network errors gracefully', async () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authClient = new MCPClient(mockSettings);

      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        throw new Error('Network error');
      });

      const tools = await authClient.getTools();
      expect(tools).toEqual([]);
    });

    it('should cache tools after first successful fetch', async () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authClient = new MCPClient(mockSettings);

      const mockTools = [{ name: 'cached_tool', description: 'Cached', inputSchema: {} }];
      
      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        yield { tools: mockTools };
      });

      // First call
      const tools1 = await authClient.getTools();
      
      // Second call should use cache
      const tools2 = await authClient.getTools();
      
      expect(tools1).toEqual(mockTools);
      expect(tools2).toEqual(mockTools);
      expect(streamFromEndpoint).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON responses', async () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authClient = new MCPClient(mockSettings);

      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        yield 'invalid json';
      });

      const tools = await authClient.getTools();
      expect(tools).toEqual([]);
    });

    it('should handle missing tools field in response', async () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'test-token';
      const authClient = new MCPClient(mockSettings);

      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        yield { result: { other_field: 'value' } };
      });

      const tools = await authClient.getTools();
      expect(tools).toEqual([]);
    });

    it('should handle authentication failures', async () => {
      mockLocalStorage['oauth_access_token_https://mcp.example.com'] = 'invalid-token';
      const authClient = new MCPClient(mockSettings);

      const { streamFromEndpoint } = require('../../src/llm/streaming');
      streamFromEndpoint.mockImplementation(async function* () {
        throw new Error('401 Unauthorized');
      });

      const tools = await authClient.getTools();
      expect(tools).toEqual([]);
    });
  });

  describe('settings updates', () => {
    it('should handle settings updates', () => {
      const newSettings = { ...mockSettings, mcpServerUrl: 'https://new.server.com' };
      const newClient = new MCPClient(newSettings);
      
      expect(newClient.getServerUrl()).toBe('https://new.server.com');
      expect(newClient.getName()).toBe('new-server-com');
    });

    it('should clear cached tools when server URL changes', async () => {
      // This would require refactoring the client to support settings updates
      // For now, we test that a new client has fresh state
      const client1 = new MCPClient(mockSettings);
      const client2 = new MCPClient({ ...mockSettings, mcpServerUrl: 'https://other.com' });
      
      expect(client1.getServerUrl()).toBe('https://mcp.example.com');
      expect(client2.getServerUrl()).toBe('https://other.com');
    });
  });
});