import { LLMStreamChunk, NotesCriticSettings, ConversationTurn, LLMFile, ChunkType, ToolCallResult, ToolCall, TokenUsage } from 'types';
import { requestUrl, App } from 'obsidian';
import { streamFromEndpoint, HttpConfig } from 'llm/streaming';
import { ObsidianFileProcessor } from 'llm/fileUtils';

export interface ToolCallDelta {
    index: number;
    content: string;
}

export interface BlockStart {
    index: number;
    type: ChunkType;
}

export interface StreamParseResult {
    content?: string;
    isComplete?: boolean;
    error?: string;
    isThinking?: boolean;
    toolCall?: ToolCall;
    toolCallDelta?: ToolCallDelta;
    toolCallResult?: ToolCallResult;
    signature?: any;
    blockStart?: BlockStart;
    blockComplete?: {
        index: number;
    };
    tokenUsage?: TokenUsage;
}

export interface ProviderConfig {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
    parseObject: (obj: any) => StreamParseResult;
}

export abstract class BaseLLMProvider {
    protected settings: NotesCriticSettings;
    protected fileProcessor: ObsidianFileProcessor;

    constructor(settings: NotesCriticSettings, app: App) {
        this.settings = settings;
        this.fileProcessor = new ObsidianFileProcessor(app);
    }

    async *callLLM(messages: ConversationTurn[], systemPrompt?: string): AsyncGenerator<LLMStreamChunk, void, unknown> {
        try {
            // Process files in messages
            const processedMessages = await this.processMessagesWithFiles(messages);
            const config = this.createConfig(
                processedMessages,
                systemPrompt || this.settings.systemPrompt,
                this.settings.thinkingBudgetTokens > 0,
                this.settings.enabledTools
            );

            const response = this.streamResponse(config);
            let fullResponse = '';

            for await (const chunk of response) {
                if (chunk.type === 'content') {
                    fullResponse += chunk.content;
                }
                yield chunk;
            }
        } catch (error) {
            yield { type: 'error', content: error.message, id: 'error' };
        }
    }

    private async processMessagesWithFiles(messages: ConversationTurn[]): Promise<ConversationTurn[]> {
        const processedMessages: ConversationTurn[] = [];

        for (const message of messages) {
            if (message.userInput.files && message.userInput.files.length > 0) {
                processedMessages.push({
                    ...message,
                    userInput: {
                        ...message.userInput,
                        files: await this.getFiles(message.userInput.files)
                    }
                });
            } else {
                processedMessages.push(message);
            }
        }

        return processedMessages;
    }

    private async getFiles(files: LLMFile[]): Promise<any> {
        return await this.fileProcessor.processAllFiles(files);
    }

    protected abstract createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, enabledTools: string[]): ProviderConfig;
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
        if (settings) {
            const apiKeyField = this.getApiKeyField();
            (settings as Record<string, any>)[apiKeyField] = apiKey;
        }

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
        return await tempProvider.testApiKey(apiKey, app);
    }

    // Abstract method for provider-specific message wrapping
    protected abstract wrapMessages(messages: any[]): any;
    protected abstract formatText(text: string, filename?: string): any;
    protected abstract formatImage(base64: string, mimeType: string): any;
    protected abstract formatFile(file: LLMFile): any;

    // Unified formatMessages implementation
    protected formatMessages(messages: ConversationTurn[]): any[] {
        return messages.map(msg => this.formatMessage(msg)).flat();
    }
    // Unified formatMessage implementation
    protected formatMessage(message: ConversationTurn): any[] {
        return [{
            role: message.userInput.type,
            content: this.formatMessageContent(message)
        }]
    }

    // Abstract method for provider-specific content formatting
    protected formatMessageContent(message: ConversationTurn): any {
        const content: any[] = [];

        // Add text content if present
        if (message.steps[message.steps.length - 1].content) {
            content.push(this.formatText(message.userInput.prompt));
        }

        // Add files if present
        if (message.userInput.files && message.userInput.files.length > 0) {
            for (const file of message.userInput.files) {
                const formatted = this.formatFile(file);
                if (formatted) {
                    content.push(formatted);
                }
            }
        }
        return content;
    }

    private async *streamResponse(config: ProviderConfig): AsyncGenerator<LLMStreamChunk, void, unknown> {
        try {
            const httpConfig: HttpConfig = {
                url: config.url,
                method: 'POST',
                headers: config.headers,
                body: config.body
            };

            // Track tool calls in progress
            const toolCalls = new Map<number, ToolCall & { input: string }>();
            let currentBlock = { index: -1 }
            let currentBlockType: ChunkType | null = null
            let blockContent = ''
            let lastTool = undefined

            // Use generic streaming function and parse each JSON object
            for await (const jsonObj of streamFromEndpoint(httpConfig)) {
                const result = config.parseObject(jsonObj);

                if (result.error) {
                    yield { type: 'error', content: result.error, id: currentBlock.index };
                    return;
                }

                if (result.blockStart) {
                    currentBlock = result.blockStart;
                    blockContent = ''
                }

                if (result.signature) {
                    yield { type: "signature", content: result.signature, id: currentBlock.index };
                }

                // Handle tool call streaming
                if (result.toolCall) {
                    currentBlockType = 'tool_call'
                    toolCalls.set(currentBlock.index, { ...result.toolCall, input: '' });
                    lastTool = result.toolCall
                    yield {
                        type: "tool_call", content: '', toolCall: result.toolCall, id: currentBlock.index
                    };
                }

                if (result.toolCallResult) {
                    currentBlockType = 'tool_call_result'
                    const tool = toolCalls.get(currentBlock.index) || lastTool
                    if (tool) {
                        yield {
                            type: "tool_call_result", content: '', toolCallResult: result.toolCallResult, id: currentBlock.index
                        };
                    }
                }

                if (result.toolCallDelta) {
                    const { index, content } = result.toolCallDelta;
                    const toolCall = toolCalls.get(index);
                    if (toolCall) {
                        toolCall.input += content;
                    }
                }

                if (result.blockComplete) {
                    const { index } = result.blockComplete;
                    const toolCall = toolCalls.get(index);
                    if (toolCall) {
                        try {
                            // Parse the accumulated JSON - use the input if partialJson is empty
                            let parsedInput;
                            if (toolCall.input) {
                                parsedInput = JSON.parse(toolCall.input);
                            } else {
                                parsedInput = toolCall.input;
                            }

                            // Yield the tool call for execution by higher-level code
                            yield {
                                type: 'tool_call',
                                content: toolCall.input,
                                toolCall: { ...toolCall, input: parsedInput },
                                isComplete: true,
                                id: currentBlock.index
                            };
                        } catch (error) {
                            yield { type: 'error', content: `Failed to parse tool call: ${error.message}`, id: currentBlock.index };
                        }
                        toolCalls.delete(index);
                    } else if (currentBlockType) {
                        yield { type: currentBlockType, content: blockContent, isComplete: true, id: currentBlock.index };
                    }

                    currentBlock = { index: -1 };
                    currentBlockType = null
                    blockContent = ''
                }

                if (result.content) {
                    currentBlockType = result.isThinking ? 'thinking' : 'content';
                    yield { type: currentBlockType, content: result.content, id: currentBlock.index };
                    blockContent += result.content
                }

                if (result.tokenUsage) {
                    yield { type: 'usage', content: '', tokenUsage: result.tokenUsage, id: currentBlock.index };
                }

                if (result.isComplete) {
                    yield { type: 'done', content: '', id: currentBlock.index };
                    return;
                }
            }

            if (currentBlockType === 'tool_call' && currentBlock.index && toolCalls.get(currentBlock.index)) {
                yield { type: 'tool_call', content: '', toolCall: toolCalls.get(currentBlock.index), id: currentBlock.index };
            }

            yield { type: 'done', content: '', id: currentBlock.index };
        } catch (error) {
            yield {
                type: 'error',
                content: `Request failed: ${error.message}`,
                id: 'error'
            };
        }
    }

    updateSettings(settings: NotesCriticSettings) {
        this.settings = settings;
    }

    protected async testApiKey(apiKey: string, app?: App): Promise<boolean> {
        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        try {
            const { settings, bodyOverrides } = this.createTestConfig(apiKey);
            const tempSettings = { ...this.settings, ...settings };

            // Create a minimal app object if not provided for testing
            const testApp = app || {
                vault: {
                    getAbstractFileByPath: () => null,
                    read: () => Promise.resolve(''),
                    create: () => Promise.resolve(null),
                    modify: () => Promise.resolve(),
                    readBinary: () => Promise.resolve(new ArrayBuffer(0)),
                    getFiles: () => []
                }
            };

            const tempProvider = new (this.constructor as new (settings: NotesCriticSettings, app: App) => BaseLLMProvider)(tempSettings, testApp as App);
            const config = tempProvider.createConfig([{ id: '1', timestamp: new Date(), userInput: { type: 'chat_message', message: 'Hi', prompt: 'Hi' }, steps: [], isComplete: false }], '', false, []);

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

    public async makeTitle(conversation: ConversationTurn[]): Promise<string> {
        const history = conversation.map(turn => {
            const user = turn.userInput.prompt
            const assistant = turn.steps.map(step => step.content).join('\n')
            return `User: ${user}\nAssistant: ${assistant}`
        }).join('\n\n')

        const titleConversation: ConversationTurn[] = [
            {
                id: 'summary',
                timestamp: new Date(),
                userInput: {
                    type: 'chat_message',
                    message: '',
                    prompt: `Please come up with a title for the following conversation in up to 30 characters.
                    The title should be a single sentence that captures the essence of the whole conversation.
                    The title should be in the same language as the conversation.
                    The title should be a single sentence that captures the essence of the conversation.

                    Please return only the title, no other text.
                    It's very important that the title is no more than 30 characters - any more will be truncated

            ${history}`
                },
                steps: [],
                isComplete: false
            }
        ]
        for await (const chunk of this.callLLM(titleConversation, "You're an expert at coming up with titles for conversations")) {
            if (chunk.type === 'content' && chunk.isComplete) {
                return chunk.content.trim().slice(0, 60);
            }
        }
        return '';
    }
}