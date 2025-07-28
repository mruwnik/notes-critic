import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OAuthClient, OAuthServerMetadata, OAuthClientInfo, OAuthTokens } from '../../src/llm/oauthClient';
import { requestUrl } from 'obsidian';

// Mock Obsidian requestUrl
jest.mock('obsidian', () => ({
  requestUrl: jest.fn()
}));

describe('OAuthClient', () => {
  let client: OAuthClient;
  let mockLocalStorage: { [key: string]: string };
  const serverUrl = 'https://mcp.example.com';
  const baseUrl = 'https://mcp.example.com';

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};
    
    // Use Object.defineProperty to ensure the mock is properly applied
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: jest.fn().mockImplementation((key: string) => {
          return mockLocalStorage[key] || null;
        }),
        setItem: jest.fn().mockImplementation((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn().mockImplementation((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn().mockImplementation(() => {
          mockLocalStorage = {};
        }),
        length: 0,
        key: jest.fn()
      },
      configurable: true,
      writable: true
    });

    // Mock sessionStorage too
    let mockSessionStorage: { [key: string]: string } = {};
    
    Object.defineProperty(global, 'sessionStorage', {
      value: {
        getItem: jest.fn().mockImplementation((key: string) => {
          return mockSessionStorage[key] || null;
        }),
        setItem: jest.fn().mockImplementation((key: string, value: string) => {
          mockSessionStorage[key] = value;
        }),
        removeItem: jest.fn().mockImplementation((key: string) => {
          delete mockSessionStorage[key];
        }),
        clear: jest.fn().mockImplementation(() => {
          mockSessionStorage = {};
        }),
        length: 0,
        key: jest.fn()
      },
      configurable: true,
      writable: true
    });

    // Mock crypto for PKCE
    const mockDigest = new ArrayBuffer(32);
    const view = new Uint8Array(mockDigest);
    for (let i = 0; i < 32; i++) {
      view[i] = i; // Fill with predictable values
    }
    
    Object.defineProperty(global, 'crypto', {
      value: {
        getRandomValues: jest.fn((array: Uint8Array) => {
          // Fill with predictable values for testing
          for (let i = 0; i < array.length; i++) {
            array[i] = i % 256;
          }
          return array;
        }),
        subtle: {
          digest: jest.fn(() => Promise.resolve(mockDigest))
        }
      },
      configurable: true,
      writable: true
    });

    // Mock btoa for base64 encoding
    global.btoa = jest.fn((str: string) => Buffer.from(str, 'binary').toString('base64'));
    global.atob = jest.fn((str: string) => Buffer.from(str, 'base64').toString('binary'));

    client = new OAuthClient(serverUrl);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with server URL', () => {
      expect(client['serverUrl']).toBe(serverUrl);
      expect(client['baseUrl']).toBe(baseUrl);
    });

    it('should handle URLs with ports', () => {
      const urlWithPort = 'https://mcp.example.com:8080/path';
      const portClient = new OAuthClient(urlWithPort);
      
      expect(portClient['baseUrl']).toBe('https://mcp.example.com:8080');
      expect(portClient['serverUrl']).toBe(urlWithPort);
    });

    it('should load existing tokens from localStorage', () => {
      // Set up localStorage data before creating the client
      mockLocalStorage[`oauth_access_token_${serverUrl}`] = 'stored-access-token';
      mockLocalStorage[`oauth_refresh_token_${serverUrl}`] = 'stored-refresh-token';
      
      // Create a new client that will load the tokens
      const tokenClient = new OAuthClient(serverUrl);
      
      expect(tokenClient['accessToken']).toBe('stored-access-token');
      expect(tokenClient['refreshToken']).toBe('stored-refresh-token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no access token', () => {
      expect(client.isAuthenticated()).toBe(false);
    });

    it('should return true when access token exists', () => {
      client['accessToken'] = 'test-token';
      expect(client.isAuthenticated()).toBe(true);
    });
  });

  describe('getAccessToken', () => {
    it('should return null when no token', () => {
      expect(client.getAccessToken()).toBeNull();
    });

    it('should return stored token', () => {
      client['accessToken'] = 'test-token';
      expect(client.getAccessToken()).toBe('test-token');
    });
  });

  describe('discoverServer', () => {
    const mockServerMetadata: OAuthServerMetadata = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'write'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post']
    };

    it('should discover server metadata successfully', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        json: mockServerMetadata
      });

      const metadata = await client.discoverServer();
      
      expect(metadata).toEqual(mockServerMetadata);
      expect(client['serverMetadata']).toEqual(mockServerMetadata);
      expect(requestUrl).toHaveBeenCalledWith({
        url: `${baseUrl}/.well-known/oauth-authorization-server`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
    });

    it('should handle discovery errors', async () => {
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(client.discoverServer()).rejects.toThrow('Network error');
    });

    it('should cache server metadata', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        json: mockServerMetadata
      });

      // First call
      await client.discoverServer();
      
      // Second call should use cached data
      const metadata = await client.discoverServer();
      
      expect(metadata).toEqual(mockServerMetadata);
      expect(requestUrl).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerClient', () => {
    const mockClientInfo: OAuthClientInfo = {
      client_id: 'test-client-id',
      token_endpoint_auth_method: 'none'
    };

    beforeEach(async () => {
      // Set up server metadata
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
    });

    it('should register client successfully', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        json: mockClientInfo
      });

      const clientInfo = await client.registerClient();
      
      expect(clientInfo).toEqual(mockClientInfo);
      expect(client['client']).toEqual(mockClientInfo);
      expect(requestUrl).toHaveBeenCalledWith({
        url: `${baseUrl}/oauth/register`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_name: 'Obsidian Notes Critic',
          client_uri: 'https://github.com/obsidian-notes-critic/obsidian-notes-critic',
          redirect_uris: [`obsidian://mcp-auth-callback?serverUrl=${encodeURIComponent(serverUrl)}`],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
          scope: 'read write'
        }),
        throw: false
      });
    });

    it('should throw error when no server metadata', async () => {
      client['serverMetadata'] = null;
      
      await expect(client.registerClient()).rejects.toThrow('Server does not support Dynamic Client Registration');
    });

    it('should throw error when no registration endpoint', async () => {
      client['serverMetadata'] = {
        ...client['serverMetadata']!,
        registration_endpoint: undefined
      };
      
      await expect(client.registerClient()).rejects.toThrow('Server does not support Dynamic Client Registration');
    });

    it('should handle registration errors', async () => {
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Registration failed'));

      await expect(client.registerClient()).rejects.toThrow('Registration failed');
    });

    it('should cache client info', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        json: mockClientInfo
      });

      // First call
      await client.registerClient();
      
      // Second call should use cached data
      const clientInfo = await client.registerClient();
      
      expect(clientInfo).toEqual(mockClientInfo);
      expect(requestUrl).toHaveBeenCalledTimes(1);
    });

    it('should store client info in localStorage', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        json: mockClientInfo
      });

      await client.registerClient();
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        `oauth_client_id_${serverUrl}`,
        mockClientInfo.client_id
      );
    });
  });

  describe('authorize', () => {
    beforeEach(async () => {
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
      
      client['client'] = {
        client_id: 'test-client-id',
        token_endpoint_auth_method: 'none'
      };
    });

    it('should generate authorization URL with PKCE', async () => {
      const authUrl = await client.authorize();
      
      const url = new URL(authUrl);
      expect(url.origin + url.pathname).toBe(`${baseUrl}/oauth/authorize`);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toContain('obsidian://');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('scope')).toBe('read write');
      
      // Verify code verifier is stored
      expect(client['codeVerifier']).toBeTruthy();
    });

    it('should throw error when no server metadata', async () => {
      client['serverMetadata'] = null;
      
      // Mock the discoverServerMetadata to throw an error
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      await expect(client.authorize()).rejects.toThrow('OAuth server metadata discovery failed');
    });

    it('should throw error when no client info', async () => {
      client['client'] = null;
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
      
      await expect(client.authorize()).rejects.toThrow('Server does not support Dynamic Client Registration');
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockTokens: OAuthTokens = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'read write'
    };

    beforeEach(() => {
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
      
      client['client'] = {
        client_id: 'test-client-id',
        token_endpoint_auth_method: 'none'
      };
      
      client['codeVerifier'] = 'test-code-verifier';
    });

    it('should exchange authorization code for tokens', async () => {
      // Set up sessionStorage data
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'test-state');
      (global.sessionStorage.setItem as jest.Mock)('oauth_code_verifier_https://mcp.example.com', 'test-code-verifier');
      
      (requestUrl as jest.Mock).mockResolvedValue({
        json: mockTokens
      });

      const tokens = await client.exchangeCodeForToken('auth-code', 'test-state');
      
      expect(tokens).toEqual(mockTokens);
      expect(client['accessToken']).toBe('new-access-token');
      expect(client['refreshToken']).toBe('new-refresh-token');
      
      const call = (requestUrl as jest.Mock).mock.calls[0][0];
      expect(call.url).toBe(`${baseUrl}/oauth/token`);
      expect(call.method).toBe('POST');
      expect(call.headers).toEqual({
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      });
      expect(call.body).toContain('grant_type=authorization_code');
      expect(call.body).toContain('code=auth-code');
      expect(call.body).toContain('redirect_uri=obsidian%3A%2F%2F');
      expect(call.body).toContain('client_id=test-client-id');
      expect(call.body).toContain('code_verifier=test-code-verifier');
    });

    it('should store tokens in localStorage', async () => {
      // Set up sessionStorage data
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'test-state');
      (global.sessionStorage.setItem as jest.Mock)('oauth_code_verifier_https://mcp.example.com', 'test-code-verifier');
      
      (requestUrl as jest.Mock).mockResolvedValue({
        json: mockTokens
      });

      await client.exchangeCodeForToken('auth-code', 'test-state');
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        `oauth_access_token_${serverUrl}`,
        'new-access-token'
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        `oauth_refresh_token_${serverUrl}`,
        'new-refresh-token'
      );
    });

    it('should throw error when no server metadata', async () => {
      // Set up sessionStorage data for state check but no code verifier so it fails early
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'state');
      // Don't set up a code verifier so it fails with the code verifier error first
      
      client['serverMetadata'] = null;
      
      await expect(client.exchangeCodeForToken('code', 'state')).rejects.toThrow('Code verifier not found');
    });

    it('should throw error when no client info', async () => {
      // Set up sessionStorage data for state check
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'state');
      
      client['client'] = null;
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
      
      await expect(client.exchangeCodeForToken('code', 'state')).rejects.toThrow('Server does not support Dynamic Client Registration');
    });

    it('should throw error when no code verifier', async () => {
      // Set up sessionStorage data for state check, but no code verifier
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'state');
      
      client['codeVerifier'] = null;
      
      await expect(client.exchangeCodeForToken('code', 'state')).rejects.toThrow('Code verifier not found');
    });

    it('should handle token exchange errors', async () => {
      // Set up sessionStorage data
      (global.sessionStorage.setItem as jest.Mock)('oauth_state_https://mcp.example.com', 'state');
      (global.sessionStorage.setItem as jest.Mock)('oauth_code_verifier_https://mcp.example.com', 'test-code-verifier');
      
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Token exchange failed'));

      await expect(client.exchangeCodeForToken('code', 'state')).rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAccessToken', () => {
    const refreshedTokens: OAuthTokens = {
      access_token: 'refreshed-access-token',
      token_type: 'Bearer',
      expires_in: 3600
    };

    beforeEach(() => {
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256']
      };
      
      client['client'] = {
        client_id: 'test-client-id',
        token_endpoint_auth_method: 'none'
      };
      
      client['refreshToken'] = 'existing-refresh-token';
    });

    it('should refresh access token successfully', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        json: refreshedTokens
      });

      const tokens = await client.refreshAccessToken();
      
      expect(tokens).toEqual(refreshedTokens);
      expect(client['accessToken']).toBe('refreshed-access-token');
      
      expect(requestUrl).toHaveBeenCalledWith({
        url: `${baseUrl}/oauth/token`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'grant_type=refresh_token&refresh_token=existing-refresh-token&client_id=test-client-id'
      });
    });

    it('should throw error when no refresh token', async () => {
      client['refreshToken'] = null;
      
      await expect(client.refreshAccessToken()).rejects.toThrow('No refresh token available');
    });

    it('should handle refresh errors', async () => {
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Refresh failed'));

      await expect(client.refreshAccessToken()).rejects.toThrow('Refresh failed');
    });
  });

  describe('PKCE utilities', () => {
    it('should generate code verifier and challenge', async () => {
      // Set up the required mocks for authorize method
      client['serverMetadata'] = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256']
      };
      
      const mockClientInfo = {
        client_id: 'test-client-id',
        token_endpoint_auth_method: 'none'
      };
      
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        json: mockClientInfo
      });
      
      const authUrl = await client.authorize();
      
      expect(client['codeVerifier']).toBeTruthy();
      expect(client['codeVerifier']!.length).toBeGreaterThan(40);
      
      const url = new URL(authUrl);
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('error edge cases', () => {
    it('should handle invalid server URLs gracefully', () => {
      expect(() => new OAuthClient('not-a-url')).toThrow();
    });

    it('should handle empty server metadata responses', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        json: {}
      });

      const metadata = await client.discoverServer();
      expect(metadata).toEqual({});
    });

    it('should handle malformed JSON responses', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        json: 'not-json'
      });

      const metadata = await client.discoverServer();
      expect(metadata).toBe('not-json');
    });
  });
});