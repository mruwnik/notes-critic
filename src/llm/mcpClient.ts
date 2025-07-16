import { NotesCriticSettings } from 'types';
import { streamFromEndpoint, HttpConfig } from './streaming';

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    outputSchema?: Record<string, any>;
}

export class MCPClient {
    private settings: NotesCriticSettings;
    private serverUrl: string;
    private apiKey: string | null = null;
    private tools: Tool[] = [];

    constructor(settings: NotesCriticSettings) {
        this.settings = settings;
        this.serverUrl = settings.mcpServerUrl?.trim() || '';
        this.apiKey = localStorage.getItem(`oauth_access_token_${this.serverUrl}`);
    }

    public isEnabled(): boolean {
        return this.settings.mcpMode !== 'disabled' && this.serverUrl !== '';
    }

    public isAuthenticated(): boolean {
        return this.apiKey !== null;
    }

    public getName(): string {
        try {
            const url = new URL(this.settings.mcpServerUrl || '');
            return url.hostname.replace(/\./g, "-");
        } catch {
            return '';
        }
    }

    public getServerUrl(): string | undefined {
        return this.settings.mcpServerUrl;
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
            url: `${this.serverUrl}${endpoint}`,
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
                this.tools = data.result.tools;
                return this.tools;
            }
        }
        throw new Error('No response from MCP server');
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
} 