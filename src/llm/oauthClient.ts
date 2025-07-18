import { requestUrl } from 'obsidian';
import { MCP_AUTH_CALLBACK } from '../constants';

export interface OAuthServerMetadata {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    response_types_supported: string[];
    grant_types_supported: string[];
    code_challenge_methods_supported: string[];
    scopes_supported?: string[];
    token_endpoint_auth_methods_supported?: string[];
}

export interface OAuthClientInfo {
    client_id: string;
    client_secret?: string;
    token_endpoint_auth_method: string;
}

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in?: number;
    scope?: string;
}

export class OAuthClient {
    private baseUrl: string;
    private serverUrl: string;
    private serverMetadata: OAuthServerMetadata | null = null;
    private client: OAuthClientInfo | null = null;
    private codeVerifier: string | null = null;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;

    constructor(serverUrl: string) {
        const serverUrlObj = new URL(serverUrl);
        this.baseUrl = `${serverUrlObj.protocol}//${serverUrlObj.hostname}${serverUrlObj.port ? `:${serverUrlObj.port}` : ''}`;
        this.serverUrl = serverUrl;
        this.loadStoredTokens();
    }

    /**
     * Load tokens from localStorage
     */
    private loadStoredTokens(): void {
        this.accessToken = localStorage.getItem(`oauth_access_token_${this.serverUrl}`);
        this.refreshToken = localStorage.getItem(`oauth_refresh_token_${this.serverUrl}`);
        this.codeVerifier = sessionStorage.getItem(`oauth_code_verifier_${this.serverUrl}`);
    }

    /**
     * Check if user is authenticated
     */
    public isAuthenticated(): boolean {
        return this.accessToken !== null;
    }

    /**
     * Generate random string for OAuth parameters
     */
    private generateRandomString(length: number = 32): string {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }

    /**
     * Generate base64url-encoded SHA256 hash
     */
    private async sha256(plain: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Generate PKCE code verifier and challenge
     */
    private async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
        const codeVerifier = this.generateRandomString(128);
        const codeChallenge = await this.sha256(codeVerifier);
        return { codeVerifier, codeChallenge };
    }

    /**
     * Discover OAuth server metadata
     */
    public async discoverServerMetadata(): Promise<OAuthServerMetadata> {
        if (this.serverMetadata) {
            return this.serverMetadata;
        }

        // Extract base URL (protocol + hostname + port) from serverUrl
        const metadataUrl = `${this.baseUrl}/.well-known/oauth-authorization-server`;

        try {
            const response = await requestUrl({
                url: metadataUrl,
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.status >= 400) {
                throw new Error(`Failed to fetch server metadata: ${response.status}`);
            }

            this.serverMetadata = response.json as OAuthServerMetadata;
            return this.serverMetadata;
        } catch (error) {
            throw new Error(`OAuth server metadata discovery failed: ${error.message}`);
        }
    }

    /**
     * Register client with the authorization server
     */
    public async registerClient(): Promise<OAuthClientInfo> {
        if (this.client) {
            return this.client;
        }

        // Check if we have a stored client
        const storedClientId = localStorage.getItem(`oauth_client_id_${this.serverUrl}`);
        const storedClientSecret = localStorage.getItem(`oauth_client_secret_${this.serverUrl}`);

        if (storedClientId) {
            this.client = {
                client_id: storedClientId,
                client_secret: storedClientSecret || undefined,
                token_endpoint_auth_method: storedClientSecret ? 'client_secret_post' : 'none'
            };
            return this.client;
        }

        const metadata = await this.discoverServerMetadata();

        if (!metadata.registration_endpoint) {
            throw new Error('Server does not support Dynamic Client Registration (no registration_endpoint in metadata)');
        }

        const registrationData = {
            client_name: 'Obsidian Notes Critic',
            client_uri: 'https://github.com/obsidian-notes-critic/obsidian-notes-critic',
            redirect_uris: [`obsidian://${MCP_AUTH_CALLBACK}`],
            response_types: ['code'],
            grant_types: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_method: 'none',
            application_type: 'native',
            scope: 'read write'
        };

        const response = await requestUrl({
            url: metadata.registration_endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(registrationData),
            throw: false
        });

        if (response.status >= 400) {
            console.error('Client registration failed:', response.status, response.json);
            throw new Error(`Client registration failed: ${response.status}`);
        }

        const clientInfo = response.json;
        console.log('Client registration response:', clientInfo);

        // Store client info
        localStorage.setItem(`oauth_client_id_${this.serverUrl}`, clientInfo.client_id);
        if (clientInfo.client_secret) {
            localStorage.setItem(`oauth_client_secret_${this.serverUrl}`, clientInfo.client_secret);
        }

        this.client = {
            client_id: clientInfo.client_id,
            client_secret: clientInfo.client_secret || undefined,
            token_endpoint_auth_method: clientInfo.client_secret ? 'client_secret_post' : 'none'
        };

        console.log('Successfully registered OAuth client:', clientInfo.client_id);
        return this.client;

    }

    /**
     * Start OAuth authorization flow
     */
    public async authorize(): Promise<string> {
        const metadata = await this.discoverServerMetadata();
        const client: OAuthClientInfo = await this.registerClient();

        // Generate PKCE parameters
        const { codeVerifier, codeChallenge } = await this.generatePKCE();
        this.codeVerifier = codeVerifier;

        // Store code verifier for token exchange
        sessionStorage.setItem(`oauth_code_verifier_${this.serverUrl}`, codeVerifier);

        // Generate state parameter
        const state = this.generateRandomString(32);
        sessionStorage.setItem(`oauth_state_${this.serverUrl}`, state);

        // Build authorization URL
        const authUrl = new URL(metadata.authorization_endpoint);
        authUrl.searchParams.set('client_id', client.client_id);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', 'obsidian://mcp-auth-callback');
        authUrl.searchParams.set('scope', 'read write');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        return authUrl.toString();
    }

    /**
     * Exchange authorization code for tokens
     */
    public async exchangeCodeForToken(code: string, state: string): Promise<OAuthTokens> {
        // Verify state parameter
        const storedState = sessionStorage.getItem(`oauth_state_${this.serverUrl}`);
        if (!storedState || storedState !== state) {
            throw new Error('Invalid state parameter');
        }

        const metadata = await this.discoverServerMetadata();
        const client: OAuthClientInfo = await this.registerClient();

        const codeVerifier = sessionStorage.getItem(`oauth_code_verifier_${this.serverUrl}`);
        if (!codeVerifier) {
            throw new Error('Code verifier not found');
        }

        const tokenData = new URLSearchParams();
        tokenData.append('grant_type', 'authorization_code');
        tokenData.append('code', code);
        tokenData.append('redirect_uri', 'obsidian://mcp-auth-callback');
        tokenData.append('client_id', client.client_id);
        tokenData.append('code_verifier', codeVerifier);

        if (client.client_secret) {
            tokenData.append('client_secret', client.client_secret);
        }

        const response = await requestUrl({
            url: metadata.token_endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: tokenData.toString(),
            throw: false
        });

        if (response.status >= 400) {
            throw new Error(`Token exchange failed: ${response.status}`);
        }

        const tokens = response.json as OAuthTokens;

        // Store tokens
        this.accessToken = tokens.access_token;
        localStorage.setItem(`oauth_access_token_${this.serverUrl}`, tokens.access_token);

        if (tokens.refresh_token) {
            this.refreshToken = tokens.refresh_token;
            localStorage.setItem(`oauth_refresh_token_${this.serverUrl}`, tokens.refresh_token);
        }

        // Clean up session storage
        sessionStorage.removeItem(`oauth_code_verifier_${this.serverUrl}`);
        sessionStorage.removeItem(`oauth_state_${this.serverUrl}`);

        return tokens;
    }

    /**
     * Refresh access token
     */
    public async refreshAccessToken(): Promise<OAuthTokens> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const metadata = await this.discoverServerMetadata();
        const client: OAuthClientInfo = await this.registerClient();

        const tokenData = new URLSearchParams();
        tokenData.append('grant_type', 'refresh_token');
        tokenData.append('refresh_token', this.refreshToken);
        tokenData.append('client_id', client.client_id);

        if (client.client_secret) {
            tokenData.append('client_secret', client.client_secret);
        }

        const response = await requestUrl({
            url: metadata.token_endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: tokenData.toString()
        });

        if (response.status >= 400) {
            throw new Error(`Token refresh failed: ${response.status}`);
        }

        const tokens = response.json as OAuthTokens;

        // Update stored tokens
        this.accessToken = tokens.access_token;
        localStorage.setItem(`oauth_access_token_${this.serverUrl}`, tokens.access_token);

        if (tokens.refresh_token) {
            this.refreshToken = tokens.refresh_token;
            localStorage.setItem(`oauth_refresh_token_${this.serverUrl}`, tokens.refresh_token);
        }

        return tokens;
    }

    /**
     * Get current access token
     */
    public getAccessToken(): string | null {
        return this.accessToken;
    }

    /**
     * Logout and clear all tokens
     */
    public async logout(): Promise<void> {
        this.accessToken = null;
        this.refreshToken = null;
        this.codeVerifier = null;

        // Clear stored tokens
        localStorage.removeItem(`oauth_access_token_${this.serverUrl}`);
        localStorage.removeItem(`oauth_refresh_token_${this.serverUrl}`);
        localStorage.removeItem(`oauth_client_id_${this.serverUrl}`);
        localStorage.removeItem(`oauth_client_secret_${this.serverUrl}`);
        sessionStorage.removeItem(`oauth_code_verifier_${this.serverUrl}`);
        sessionStorage.removeItem(`oauth_state_${this.serverUrl}`);
    }

    /**
     * Make authenticated request
     */
    public async makeAuthenticatedRequest(url: string, options: any = {}): Promise<any> {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            ...options.headers
        };

        try {
            const response = await requestUrl({
                url,
                method: options.method || 'GET',
                headers,
                body: options.body
            });

            if (response.status === 401 && this.refreshToken) {
                // Try to refresh token
                await this.refreshAccessToken();

                // Retry request with new token
                return await requestUrl({
                    url,
                    method: options.method || 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        ...options.headers
                    },
                    body: options.body
                });
            }

            return response;
        } catch (error) {
            if (error.message.includes('401') && this.refreshToken) {
                // Try to refresh token
                await this.refreshAccessToken();

                // Retry request with new token
                return await requestUrl({
                    url,
                    method: options.method || 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        ...options.headers
                    },
                    body: options.body
                });
            }
            throw error;
        }
    }
} 