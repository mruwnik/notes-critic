import { LLMStreamChunk, NotesCriticSettings, ConversationTurn } from 'types';
import { App } from 'obsidian';
import { fetchPage, TextEditorTool, TextEditorCommand } from 'llm/tools';
import { BaseLLMProvider } from 'llm/providers/Base';
import OpenAIProvider from 'llm/providers/OpenAI';
import AnthropicProvider from 'llm/providers/Anthropic';


// Factory function and main export
export class LLMProvider {
    private settings: NotesCriticSettings;
    private provider: BaseLLMProvider;
    private app: App;

    constructor(settings: NotesCriticSettings, app: App) {
        this.settings = settings;
        this.provider = this.createProvider(settings, app);
        this.app = app;
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

    async runToolCall({ toolCall }: LLMStreamChunk): Promise<any> {
        if (!toolCall?.name) {
            return;
        }
        switch (toolCall?.name) {
            case 'str_replace_based_edit_tool':
                const textEditorTool = new TextEditorTool(this.app);
                return textEditorTool.executeCommand(toolCall?.input as TextEditorCommand)
            case 'web_browser':
                return fetchPage(toolCall?.input as string)
        }
        for (const client of this.settings.mcpClients) {
            if (await client.hasTool(toolCall?.name)) {
                return client.toolCall(toolCall?.name, toolCall?.input)
            }
        }
        throw new Error(`Unsupported tool call: ${toolCall?.name}`);
    }

    async *callLLM(messages: ConversationTurn[], systemPrompt?: string): AsyncGenerator<LLMStreamChunk, void, unknown> {
        for await (const chunk of this.provider.callLLM(messages, systemPrompt)) {
            yield chunk;
            if (chunk.type === 'tool_call' && chunk.isComplete && chunk.toolCall && !chunk.toolCall.is_server_call) {
                yield {
                    type: 'tool_call_result',
                    content: '',
                    id: chunk.toolCall.id,
                    toolCallResult: {
                        id: chunk.toolCall.id,
                        result: await this.runToolCall(chunk),
                        is_server_call: false
                    }
                };
            }
        }
    }

    updateSettings(settings: NotesCriticSettings, app: App) {
        this.provider = this.createProvider(settings, app);
    }

    static async testApiKey(apiKey: string, provider: 'anthropic' | 'openai', app: App): Promise<boolean> {
        switch (provider) {
            case 'openai':
                return await OpenAIProvider.testApiKey(apiKey, app);
            case 'anthropic':
                return await AnthropicProvider.testApiKey(apiKey, app);
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }

    public async makeTitle(conversation: ConversationTurn[]): Promise<string> {
        return await this.provider.makeTitle(conversation);
    }
}