import { NotesCriticSettings, MCPServerConfig, BaseMCPClient } from 'types';
import { streamFromEndpoint, HttpConfig } from 'llm/streaming';

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    outputSchema?: Record<string, any>;
    serverId?: string; // Track which server provides this tool
}

export class MCPClient extends BaseMCPClient {
    private apiKey: string | null = null;
    public tools: Tool[] = [];

    constructor(serverConfig: MCPServerConfig) {
        super(serverConfig);
        this.serverConfig = serverConfig;
        this.apiKey = localStorage.getItem(`oauth_access_token_${serverConfig.url}`);
        this.getTools(true).then(tools => {
            this.tools = tools;
        });
    }

    public isEnabled(): boolean {
        return this.serverConfig.enabled;
    }

    public isAuthenticated(): boolean {
        return this.apiKey !== null;
    }

    public getName(): string {
        try {
            const url = new URL(this.serverConfig.url);
            return url.hostname.replace(/\./g, "-");
        } catch {
            return this.serverConfig.name || this.serverConfig.id;
        }
    }

    public getServerUrl(): string {
        return this.serverConfig.url;
    }

    public getServerId(): string {
        return this.serverConfig.id;
    }

    public getServerConfig(): MCPServerConfig {
        return this.serverConfig;
    }

    public getApiKey(): string | null {
        return this.apiKey;
    }

    /**
     * Make authenticated request to MCP server
     */
    private async* makeRequest(endpoint: string, options: any = {}): AsyncGenerator<any, void, unknown> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${this.apiKey}`,
            ...options.headers
        };

        const config: HttpConfig = {
            url: `${this.serverConfig.url}${endpoint}`,
            method: options.method || 'POST',
            headers,
            body: options.body
        };

        // Use generic streaming function
        for await (const jsonObj of streamFromEndpoint(config)) {
            if (jsonObj && typeof jsonObj === 'object') {
                yield jsonObj;
            }
        }
    }

    public async getTools(forceRefresh: boolean = false): Promise<Tool[]> {
        if (this.tools.length > 0 && !forceRefresh) {
            return this.tools;
        }
        const response = await this.makeRequest(`/tools/list`, {
            body: {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/list',
            },
        });
        for await (const data of response) {
            if (data.result && data.result.tools) {
                // Add serverId to each tool
                this.tools = data.result.tools.map((tool: Tool) => ({
                    ...tool,
                    serverId: this.serverConfig.id
                }));
                return this.tools;
            }
        }
        throw new Error('No response from MCP server');
    }

    public async hasTool(toolName: string): Promise<boolean> {
        const tools = await this.getTools(true);
        return tools.some(tool => tool.name === toolName);
    }

    public async toolCall(toolName: string, args: Record<string, any>): Promise<any> {
        const response = await this.makeRequest(`${toolName}`, {
            body: {
                jsonrpc: '2.0',
                id: Date.now(),
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: args,
                },
            },
        })
        for await (const data of response) {
            if (data.result.isError) {
                throw new Error(data.result.content[0].text);
            }
            return data.result?.content.map((item: any) => {
                try {
                    return JSON.parse(item.text)
                } catch (e) {
                    return item.text
                }
            })
        }
        throw new Error('No response from MCP server');
    }

    public async testConnection(): Promise<boolean> {
        try {
            const tools = await this.getTools(true);
            return tools.length >= 0; // Success if we can get tools (even if empty)
        } catch (error) {
            return false;
        }
    }
}

/**
 * Manager class for multiple MCP server clients
 */
export class MCPManager {
    private settings: NotesCriticSettings;
    private clients: Map<string, MCPClient> = new Map();

    constructor(settings: NotesCriticSettings) {
        this.settings = settings;
        this.initializeClients();
    }

    private initializeClients(): void {
        this.clients.clear();

        // Create client for each enabled server
        for (const serverConfig of this.settings?.mcpServers || []) {
            if (serverConfig.enabled) {
                const client = new MCPClient(serverConfig);
                this.clients.set(serverConfig.id, client);
            }
        }
    }

    public getEnabledServers(): MCPServerConfig[] {
        return this.settings.mcpServers.filter(server => server.enabled);
    }

    public getClient(serverId: string): MCPClient | undefined {
        return this.clients.get(serverId);
    }

    public getAllClients(): MCPClient[] {
        return Array.from(this.clients.values());
    }

    public async getAllTools(forceRefresh: boolean = false): Promise<Tool[]> {
        const allTools: Tool[] = [];

        for (const client of this.clients.values()) {
            if (!client.isAuthenticated()) continue;

            try {
                const tools = await client.getTools(forceRefresh);
                allTools.push(...tools);
            } catch (error) {
                console.warn(`Failed to get tools from server ${client.getServerId()}:`, error);
            }
        }

        return allTools;
    }

    public async toolCall(toolName: string, args: Record<string, any>, serverId?: string): Promise<any> {
        if (serverId) {
            const client = this.clients.get(serverId);
            if (!client) {
                throw new Error(`Server ${serverId} not found or not enabled`);
            }
            return client.toolCall(toolName, args);
        }

        // If serverId not provided, find the server that has this tool
        const allTools = await this.getAllTools();
        const tool = allTools.find(t => t.name === toolName);
        if (!tool || !tool.serverId) {
            throw new Error(`Tool ${toolName} not found in any enabled server`);
        }

        const client = this.clients.get(tool.serverId);
        if (!client) {
            throw new Error(`Server ${tool.serverId} not found or not enabled`);
        }

        return client.toolCall(toolName, args);
    }

    public async getTools(forceRefresh: boolean = false): Promise<Tool[]> {
        return this.getAllTools(forceRefresh);
    }
} 