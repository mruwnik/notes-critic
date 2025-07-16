import { LLMMessage, LLMStreamChunk, NotesCriticSettings, LLMFile } from 'types';
import { Notice, requestUrl, App } from 'obsidian';
import { MCPClient, Tool } from 'llm/mcpClient';
import { streamFromEndpoint, HttpConfig } from 'llm/streaming';
import { ObsidianFileProcessor } from 'llm/fileUtils';

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
    protected fileProcessor: ObsidianFileProcessor;

    constructor(settings: NotesCriticSettings, app: App) {
        this.settings = settings;
        this.mcpClient = new MCPClient(settings);
        this.fileProcessor = new ObsidianFileProcessor(app);
    }

    async *callLLM(messages: LLMMessage[], systemPrompt?: string): AsyncGenerator<LLMStreamChunk, void, unknown> {
        try {
            // Process files in messages
            const processedMessages = await this.processMessagesWithFiles(messages);

            const tools = await this.mcpClient.getTools();
            const config = this.createConfig(
                processedMessages,
                systemPrompt || this.settings.systemPrompt,
                this.settings.thinkingBudgetTokens > 0,
                tools
            );

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

    private async processMessagesWithFiles(messages: LLMMessage[]): Promise<LLMMessage[]> {
        const processedMessages: LLMMessage[] = [];

        for (const message of messages) {
            if (message.files && message.files.length > 0) {
                const processedFiles = await this.fileProcessor.processAllFiles(message.files);
                processedMessages.push({
                    ...message,
                    files: processedFiles
                });
            } else {
                processedMessages.push(message);
            }
        }

        return processedMessages;
    }

    protected abstract createConfig(messages: LLMMessage[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig;
    protected abstract createObjectParser(): (obj: any) => StreamParseResult;
    protected abstract getProviderName(): string;

    // Unified validateApiKey implementation
    protected validateApiKey(): void {
        if (!this.getApiKey()) {
            throw new Error(`${this.getProviderName()} API key not configured`);
        }
    }
    protected abstract getApiKey(): string;
    // Unified getModel implementation
    protected getModel(): string {
        const modelString = this.settings.model;
        const [, model] = modelString.split('/');
        return model;
    }
    // Unified createTestConfig implementation
    protected createTestConfig(apiKey: string): { settings: Partial<NotesCriticSettings>, bodyOverrides: any } {
        const settings: Partial<NotesCriticSettings> = {
            model: `${this.getProviderName().toLowerCase()}/${this.getDefaultTestModel()}`,
            maxTokens: 5
        };
        (settings as any)[this.getApiKeyField()] = apiKey;

        return {
            settings,
            bodyOverrides: this.getTestBodyOverrides()
        };
    }

    protected abstract getTestBodyOverrides(): any;
    protected abstract getApiKeyField(): keyof NotesCriticSettings;
    protected abstract getDefaultTestModel(): string;

    // Unified static testApiKey method
    static async testApiKey<T extends BaseLLMProvider>(
        this: new (settings: NotesCriticSettings, app: App) => T,
        apiKey: string,
        app: App
    ): Promise<boolean> {
        const tempProvider = new this({} as NotesCriticSettings, app);
        return await tempProvider.testApiKey(apiKey);
    }
    // Unified formatMessages implementation
    protected formatMessages(messages: LLMMessage[]): any[] {
        return messages
            .filter(msg => msg.role !== 'system') // Skip system messages - they're handled separately now
            .map(msg => ({
                role: msg.role,
                content: this.formatMessage(msg)
            }));
    }

    // Abstract method for provider-specific message wrapping
    protected abstract wrapMessages(messages: any[]): any;
    protected abstract formatText(text: string, filename?: string): any;
    protected abstract formatImage(base64: string, mimeType: string): any;

    // Unified formatMessage implementation
    protected formatMessage(message: LLMMessage): any {
        const content: any[] = [];

        // Add text content if present
        if (message.content) {
            content.push(this.formatText(message.content));
        }

        // Add files if present
        if (message.files && message.files.length > 0) {
            for (const file of message.files) {
                if (file.type === 'text') {
                    content.push(this.formatText(file.content || '', file.name));
                } else if (file.type === 'image') {
                    content.push(this.formatImage(file.content || '', file.mimeType || 'image/png'));
                }
            }
        }

        return this.formatMessageContent(content);
    }

    // Abstract method for provider-specific content formatting
    protected abstract formatMessageContent(content: any[]): any;

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
            const config = tempProvider.createConfig([{ role: 'user', content: 'Hi' }], '', false, []);

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
    protected createConfig(messages: LLMMessage[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig {
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
                input: this.wrapMessages(this.formatMessages(messages)),
                instructions: systemPrompt,
                stream: true,
                temperature: 0.7,
                max_output_tokens: 2000,
                ...extras
            },
            parseObject: this.createObjectParser()
        };
    }

    protected formatText(text: string, filename?: string): any {
        return {
            type: 'text',
            text: filename ? `File: ${filename}\n\n${text}` : text
        };
    }

    protected formatImage(base64: string, mimeType: string): any {
        return {
            type: 'image_url',
            image_url: {
                url: `data:${mimeType};base64,${base64}`
            }
        };
    }

    protected formatMessageContent(content: any[]): any {
        // If no content, add empty text
        if (content.length === 0) {
            content.push(this.formatText(''));
        }

        // If only one text content, simplify to string format
        if (content.length === 1 && content[0].type === 'text') {
            return content[0].text;
        }

        return content;
    }

    protected wrapMessages(messages: any[]): any[] {
        return messages;
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

    protected getProviderName(): string {
        return 'OpenAI';
    }

    protected getApiKey(): string {
        return this.settings.openaiApiKey;
    }

    protected getApiKeyField(): keyof NotesCriticSettings {
        return 'openaiApiKey';
    }

    protected getDefaultTestModel(): string {
        return 'gpt-3.5-turbo';
    }

    protected getTestBodyOverrides(): any {
        return {
            stream: false,
            max_output_tokens: 20,
            model: this.getDefaultTestModel()
        };
    }


}

// Anthropic provider implementation
class AnthropicProvider extends BaseLLMProvider {
    protected createConfig(messages: LLMMessage[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig {
        this.validateApiKey();
        const formattedMessages = this.formatMessages(messages);
        const wrappedMessages = this.wrapMessages(formattedMessages);

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
                messages: wrappedMessages.messages,
                system: systemPrompt,
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

    protected getProviderName(): string {
        return 'Anthropic';
    }

    protected getApiKey(): string {
        return this.settings.anthropicApiKey;
    }

    protected getApiKeyField(): keyof NotesCriticSettings {
        return 'anthropicApiKey';
    }

    protected getDefaultTestModel(): string {
        return 'claude-3-5-haiku-latest';
    }

    protected wrapMessages(messages: any[]): { messages: any[] } {
        return {
            messages: messages
        };
    }

    protected formatText(text: string, filename?: string): any {
        return {
            type: 'text',
            text: filename ? `File: ${filename}\n\n${text}` : text
        };
    }

    protected formatImage(base64: string, mimeType: string): any {
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: mimeType,
                data: base64
            }
        };
    }

    protected formatMessageContent(content: any[]): any {
        // If no content, return simple text
        if (content.length === 0) {
            return '';
        }

        // If only one text content, return it directly
        if (content.length === 1 && content[0].type === 'text') {
            return content[0].text;
        }

        return content;
    }

    protected getTestBodyOverrides(): any {
        return {
            stream: false,
            max_tokens: 5,
            model: this.getDefaultTestModel()
        };
    }


}

// Factory function and main export
export class LLMProvider {
    private provider: BaseLLMProvider;

    constructor(settings: NotesCriticSettings, app: App) {
        this.provider = this.createProvider(settings, app);
    }

    private createProvider(settings: NotesCriticSettings, app: App): BaseLLMProvider {
        const modelString = settings.model;
        const [provider] = modelString.split('/');

        switch (provider) {
            case 'openai':
                return new OpenAIProvider(settings, app);
            case 'anthropic':
                return new AnthropicProvider(settings, app);
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }

    async *callLLM(messages: LLMMessage[], systemPrompt?: string): AsyncGenerator<LLMStreamChunk, void, unknown> {
        yield* this.provider.callLLM(messages, systemPrompt);
    }

    updateSettings(settings: NotesCriticSettings, app: App) {
        this.provider = this.createProvider(settings, app);
    }

    static async testApiKey(apiKey: string, provider: 'anthropic' | 'openai', app: App): Promise<boolean> {
        switch (provider) {
            case 'openai':
                return OpenAIProvider.testApiKey(apiKey, app);
            case 'anthropic':
                return AnthropicProvider.testApiKey(apiKey, app);
            default:
                return false;
        }
    }
}

export async function createChatCompletion(
    messages: LLMMessage[],
    settings: NotesCriticSettings,
    app: App,
    onChunk: (chunk: LLMStreamChunk) => void,
    systemPrompt?: string
): Promise<string> {
    const provider = new LLMProvider(settings, app);
    let fullResponse = '';

    try {
        for await (const chunk of provider.callLLM(messages, systemPrompt)) {
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