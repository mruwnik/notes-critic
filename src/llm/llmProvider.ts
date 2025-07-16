import { LLMMessage, LLMStreamChunk, NotesCriticSettings } from 'types';
import { Notice, requestUrl } from 'obsidian';
import { MCPClient, Tool } from 'llm/mcpClient';
import { streamFromEndpoint, HttpConfig } from 'llm/streaming';

interface StreamParseResult {
    content?: string;
    isComplete?: boolean;
    error?: string;
    isThinking?: boolean;
}

interface ProviderConfig {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
    parseObject: (obj: any) => StreamParseResult;
}

abstract class BaseLLMProvider {
    protected settings: NotesCriticSettings;
    protected mcpClient: MCPClient;

    constructor(settings: NotesCriticSettings) {
        this.settings = settings;
        this.mcpClient = new MCPClient(settings);
    }

    async *callLLM(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk, void, unknown> {
        try {
            const tools = await this.mcpClient.getTools();
            const config = this.createConfig(messages, this.settings.thinkingBudgetTokens > 0, tools);

            const response = this.streamResponse(config);
            let fullResponse = '';

            for await (const chunk of response) {
                if (chunk.type === 'content') {
                    fullResponse += chunk.content;
                }
                yield chunk;
            }

            // Send the complete response back to MCP
            await this.mcpClient.toolCall('send_response', { response: fullResponse });
        } catch (error) {
            yield { type: 'error', content: error.message };
        }
    }

    protected abstract createConfig(messages: LLMMessage[], thinking: boolean, tools: Tool[]): ProviderConfig;
    protected abstract createObjectParser(): (obj: any) => StreamParseResult;
    protected abstract validateApiKey(): void;
    protected abstract getApiKey(): string;
    protected abstract getModel(): string;
    protected abstract createTestConfig(apiKey: string): { settings: Partial<NotesCriticSettings>, bodyOverrides: any };

    private async *streamResponse(config: ProviderConfig): AsyncGenerator<LLMStreamChunk, void, unknown> {
        try {
            const httpConfig: HttpConfig = {
                url: config.url,
                method: 'POST',
                headers: config.headers,
                body: config.body
            };

            // Use generic streaming function and parse each JSON object
            for await (const jsonObj of streamFromEndpoint(httpConfig)) {
                const result = config.parseObject(jsonObj);

                if (result.error) {
                    yield { type: 'error', content: result.error };
                    return;
                }

                if (result.content) {
                    const chunkType = result.isThinking ? 'thinking' : 'content';
                    yield { type: chunkType, content: result.content };
                }

                if (result.isComplete) {
                    yield { type: 'done', content: '' };
                    return;
                }
            }

            yield { type: 'done', content: '' };
        } catch (error) {
            yield {
                type: 'error',
                content: `Request failed: ${error.message}`
            };
        }
    }

    updateSettings(settings: NotesCriticSettings) {
        this.settings = settings;
    }

    protected async testApiKey(apiKey: string): Promise<boolean> {
        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        try {
            const { settings, bodyOverrides } = this.createTestConfig(apiKey);
            const tempSettings = { ...this.settings, ...settings };
            const tempProvider = new (this.constructor as any)(tempSettings);
            const config = tempProvider.createConfig([{ role: 'user', content: 'Hi' }], false);

            // Merge body with overrides and remove any unwanted fields
            const testBody = { ...config.body, ...bodyOverrides };

            // Use requestUrl to avoid CORS issues
            const response = await requestUrl({
                url: config.url,
                method: config.method,
                headers: config.headers,
                body: JSON.stringify(testBody),
                throw: false
            });

            if (response.status < 200 || response.status >= 300) {
                console.error('API key test failed:', response.status, response.json);
                return false;
            }

            return true;
        } catch (error) {
            console.error('API key test failed:', error);
            return false;
        }
    }
}

// OpenAI provider implementation
class OpenAIProvider extends BaseLLMProvider {
    protected createConfig(messages: LLMMessage[], thinking: boolean, tools: Tool[]): ProviderConfig {
        this.validateApiKey();
        const extras: any = {}
        if (tools && tools.length > 0) {
            extras.tools = [
                {
                    type: "mcp",
                    server_label: this.mcpClient.getName(),
                    server_url: this.mcpClient.getServerUrl(),
                    headers: {
                        Authorization: `Bearer ${this.mcpClient.getApiKey()}`
                    },
                    require_approval: {
                        never: {
                            tool_names: tools.map(tool => tool.name)
                        }
                    }
                }
            ]
        }

        return {
            url: 'https://api.openai.com/v1/responses',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getApiKey()}`
            },
            body: {
                model: this.getModel(),
                input: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                instructions: this.settings.systemPrompt,
                stream: true,
                temperature: 0.7,
                max_output_tokens: 2000,
                ...extras
            },
            parseObject: this.createObjectParser()
        };
    }

    protected createObjectParser(): (obj: any) => StreamParseResult {
        return (obj: any): StreamParseResult => {
            if (obj.type === "response.output_text.delta") {
                return { content: obj.delta, isThinking: false };
            }
            // Handle completion marker
            if (obj.choices?.[0]?.finish_reason) {
                return { isComplete: true };
            }

            const content = obj.choices?.[0]?.delta?.content;
            if (content) {
                // OpenAI doesn't support thinking blocks
                return { content, isThinking: false };
            }
            return {}
        };
    }

    protected validateApiKey(): void {
        if (!this.getApiKey()) {
            throw new Error('OpenAI API key not configured');
        }
    }

    protected getApiKey(): string {
        return this.settings.openaiApiKey;
    }

    protected getModel(): string {
        const modelString = this.settings.model;
        const [, model] = modelString.split('/');
        return model;
    }

    protected createTestConfig(apiKey: string): { settings: Partial<NotesCriticSettings>, bodyOverrides: any } {
        return {
            settings: {
                openaiApiKey: apiKey,
                model: 'openai/gpt-3.5-turbo',
                maxTokens: 5
            },
            bodyOverrides: {
                stream: false,
                max_output_tokens: 20,
                model: 'gpt-3.5-turbo'
            }
        };
    }

    static async testApiKey(apiKey: string): Promise<boolean> {
        const tempProvider = new OpenAIProvider({} as NotesCriticSettings);
        return await tempProvider.testApiKey(apiKey);
    }
}

// Anthropic provider implementation
class AnthropicProvider extends BaseLLMProvider {
    protected createConfig(messages: LLMMessage[], thinking: boolean, tools: Tool[]): ProviderConfig {
        this.validateApiKey();
        const anthropicMessages = this.convertToAnthropicFormat(messages);

        const defaultTools = [{
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5
        }]
        const extras: any = {}
        if (tools && tools.length > 0) {
            extras.mcp_servers = [
                {
                    name: this.mcpClient.getName(),
                    url: this.mcpClient.getServerUrl(),
                    type: "url",
                    authorization_token: this.mcpClient.getApiKey(),
                }
            ]
        }
        if (thinking && this.settings.thinkingBudgetTokens > 1024) {
            extras.thinking = {
                type: 'enabled',
                budget_tokens: this.settings.thinkingBudgetTokens
            }
        }

        return {
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.getApiKey(),
                'anthropic-version': '2023-06-01',
                "anthropic-beta": "mcp-client-2025-04-04"
            },
            body: {
                model: this.getModel(),
                max_tokens: this.settings.maxTokens,
                messages: anthropicMessages.messages,
                system: anthropicMessages.system,
                ...extras,
                tools: defaultTools,
                stream: true,
            },
            parseObject: this.createObjectParser()
        };
    }

    protected createObjectParser(): (obj: any) => StreamParseResult {
        return (obj: any): StreamParseResult => {
            if (obj.type === 'content_block_delta') {
                if (obj?.delta?.thinking) {
                    return { content: obj.delta.thinking, isThinking: true };
                }
                const content = obj.delta?.text;
                if (content) {
                    return { content, isThinking: false };
                }
            } else if (obj.type === 'message_stop') {
                return { isComplete: true };
            }
            return {};
        };
    }

    protected validateApiKey(): void {
        if (!this.getApiKey()) {
            throw new Error('Anthropic API key not configured');
        }
    }

    protected getApiKey(): string {
        return this.settings.anthropicApiKey;
    }

    protected getModel(): string {
        const modelString = this.settings.model;
        const [, model] = modelString.split('/');
        return model;
    }

    private convertToAnthropicFormat(messages: LLMMessage[]): { messages: any[], system?: string } {
        const anthropicMessages: any[] = [];
        let systemMessage = '';

        for (const message of messages) {
            if (message.role === 'system') {
                systemMessage = message.content;
            } else {
                anthropicMessages.push({
                    role: message.role,
                    content: message.content
                });
            }
        }

        return {
            messages: anthropicMessages,
            system: systemMessage || undefined
        };
    }

    protected createTestConfig(apiKey: string): { settings: Partial<NotesCriticSettings>, bodyOverrides: any } {
        return {
            settings: {
                anthropicApiKey: apiKey,
                model: 'anthropic/claude-3-haiku-20240307',
                maxTokens: 5,
            },
            bodyOverrides: {
                stream: false,
                max_tokens: 5,
                model: 'claude-3-haiku-20240307'
            }
        };
    }

    static async testApiKey(apiKey: string): Promise<boolean> {
        const tempProvider = new AnthropicProvider({} as NotesCriticSettings);
        return await tempProvider.testApiKey(apiKey);
    }
}

// Factory function and main export
export class LLMProvider {
    private provider: BaseLLMProvider;

    constructor(settings: NotesCriticSettings) {
        this.provider = this.createProvider(settings);
    }

    private createProvider(settings: NotesCriticSettings): BaseLLMProvider {
        const modelString = settings.model;
        const [provider] = modelString.split('/');

        switch (provider) {
            case 'openai':
                return new OpenAIProvider(settings);
            case 'anthropic':
                return new AnthropicProvider(settings);
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }

    async *callLLM(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk, void, unknown> {
        yield* this.provider.callLLM(messages);
    }

    updateSettings(settings: NotesCriticSettings) {
        this.provider = this.createProvider(settings);
    }

    static async testApiKey(apiKey: string, provider: 'anthropic' | 'openai'): Promise<boolean> {
        switch (provider) {
            case 'openai':
                return OpenAIProvider.testApiKey(apiKey);
            case 'anthropic':
                return AnthropicProvider.testApiKey(apiKey);
            default:
                return false;
        }
    }
}

export async function createChatCompletion(
    messages: LLMMessage[],
    settings: NotesCriticSettings,
    onChunk: (chunk: LLMStreamChunk) => void
): Promise<string> {
    const provider = new LLMProvider(settings);
    let fullResponse = '';

    try {
        for await (const chunk of provider.callLLM(messages)) {
            onChunk(chunk);

            if (chunk.type === 'content') {
                fullResponse += chunk.content;
            } else if (chunk.type === 'error') {
                throw new Error(chunk.content);
            }
        }
    } catch (error) {
        new Notice(`LLM Error: ${error.message}`);
        throw error;
    }

    return fullResponse;
} 