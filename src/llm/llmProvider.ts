import { LLMStreamChunk, NotesCriticSettings, ConversationTurn, LLMFile, ChunkType, ToolCallResult, ToolCall } from 'types';
import { requestUrl, App } from 'obsidian';
import { MCPClient, Tool } from 'llm/mcpClient';
import { streamFromEndpoint, HttpConfig } from 'llm/streaming';
import { ObsidianFileProcessor } from 'llm/fileUtils';
import { ObsidianTextEditorTool, TextEditorCommand, textEditorToolDefinition } from 'llm/tools';

interface ToolCallDelta {
    index: number;
    content: string;
}

interface BlockStart {
    index: number;
    type: ChunkType;
}

interface StreamParseResult {
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

    async *callLLM(messages: ConversationTurn[], systemPrompt?: string): AsyncGenerator<LLMStreamChunk, void, unknown> {
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

    protected abstract createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig;
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
                if (file.type === 'text') {
                    content.push(this.formatText(file.content?.toString() || '', file.name));
                } else if (file.type === 'image') {
                    content.push(this.formatImage(file.content?.toString() || '', file.mimeType || 'image/png'));
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

                if (result.isComplete) {
                    yield { type: 'done', content: '', id: currentBlock.index };
                    return;
                }
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
        this.mcpClient = new MCPClient(settings);
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
            } as any;

            const tempProvider = new (this.constructor as any)(tempSettings, testApp);
            const config = tempProvider.createConfig([{ userInput: { type: 'chat_message', prompt: 'Hi' }, steps: [] }], '', false, []);
            delete config['body']['tools'];

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
    protected createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig {
        this.validateApiKey();
        const extras: any = {}

        // Add text editor tool
        extras.tools = [{ ...textEditorToolDefinition, type: 'function' }];
        if (tools && tools.length > 0) {
            extras.tools.push({
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
            });
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
            type: 'input_text',
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

    protected formatFile(file: LLMFile): any {
        switch (file.type) {
            case 'text':
                return this.formatText(file.content?.toString() || '', file.name);
            case 'image':
                return this.formatImage(file.content || '', file.mimeType || 'image/png');
            case 'pdf':
                return {
                    type: 'input_file',
                    filename: file.name,
                    file_data: file.content || ''
                }
        }
        return null;
    }

    protected formatMessage(message: ConversationTurn): any[] {
        const baseMsg = {
            role: "user",
            content: [
                this.formatText(message.userInput.prompt),
                ...message.userInput.files?.map(this.formatFile.bind(this)) || []
            ]
        }
        const steps = message.steps.map(step => {
            return Object.values(step.toolCalls).filter(toolCall => toolCall.id.startsWith('fc_')).map(toolCall => ([
                {
                    type: "function_call",
                    id: toolCall.id,
                    call_id: toolCall.id,
                    name: toolCall.name,
                    arguments: typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input)
                },
                {
                    type: "function_call_output",
                    call_id: toolCall.id,
                    output: typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)
                }
            ]))
        }).flat()
        return [baseMsg, ...steps.flat()]
    }

    protected wrapMessages(messages: any[]): any[] {
        return messages;
    }

    protected createObjectParser(): (obj: any) => StreamParseResult {
        return (obj: any): StreamParseResult => {
            if (obj.type === "response.output_item.added") {
                if (["function_call", "mcp_call"].includes(obj.item?.type)) {
                    return {
                        blockStart: {
                            index: obj.output_index,
                            type: 'tool_call'
                        },
                        toolCall: {
                            id: obj.item.call_id,
                            name: obj.item.name,
                            input: '',
                            is_server_call: obj.item.type === "mcp_call"
                        }
                    }
                }
                if (obj.part?.type === "output_text") {
                    return {
                        blockStart: {
                            index: obj.output_index,
                            type: 'content'
                        },
                    }
                }
            }
            if (['response.function_call_arguments.delta', 'response.mcp_call_arguments.delta'].includes(obj.type)) {
                return {
                    toolCallDelta: {
                        index: obj.output_index,
                        content: obj.delta
                    }
                }
            }
            if (obj.type === "response.output_text.delta") {
                return { content: obj.delta, isThinking: false };
            }
            if (['response.output_item.done', 'response.mcp_call.done', 'response.function_call.done'].includes(obj.type)) {
                const res: StreamParseResult = {
                    blockComplete: {
                        index: obj.output_index
                    }
                }
                if (obj.item?.type === "mcp_call") {
                    res.toolCallResult = {
                        id: obj.item.id,
                        result: obj.item.output,
                        is_server_call: true
                    }
                }
                return res;
            }
            if (obj.type === "response.output_text.done") {
                return {
                    blockComplete: {
                        index: obj.output_index
                    }
                }
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
    protected getDefaultTools(model: string): Record<string, any>[] {
        const no_search = [
            'claude-3-5-sonnet-latest',
            'claude-3-5-haiku-latest'
        ]
        const no_editor = [
            'claude-3-7-sonnet-latest',
            'claude-3-5-sonnet-latest',
            'claude-3-5-haiku-latest'
        ]

        const webSearchTool = {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5
        }
        const textEditorTool = {
            type: "text_editor_20250429",
            name: "str_replace_based_edit_tool"
        }

        if (no_search.includes(model)) {
            return []
        }
        if (no_editor.includes(model)) {
            return [webSearchTool]
        }

        return [webSearchTool, textEditorTool]
    }

    protected supportsMCP(model: string): boolean {
        return !model.includes('claude-3')
    }

    protected getTools(config: Record<string, any>, tools: Tool[]): Record<string, any> {
        const model = this.getModel()
        const extras: any = { tools: this.getDefaultTools(model) }
        if (tools && tools.length > 0 && this.supportsMCP(model)) {
            extras.mcp_servers = [
                {
                    name: this.mcpClient.getName(),
                    url: this.mcpClient.getServerUrl(),
                    type: "url",
                    authorization_token: this.mcpClient.getApiKey(),
                }
            ]
        }
        return { ...config, ...extras, }
    }

    protected createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, tools: Tool[]): ProviderConfig {
        this.validateApiKey();
        const formattedMessages = this.formatMessages(messages);
        const wrappedMessages = this.wrapMessages(formattedMessages);

        const extras = this.getTools({}, tools)
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
                stream: true,
            },
            parseObject: this.createObjectParser()
        };
    }

    protected createObjectParser(): (obj: any) => StreamParseResult {
        return (obj: any): StreamParseResult => {
            if (obj.type === 'error') {
                return { error: obj.error }
            }
            if (obj.type === 'content_block_delta') {
                if (obj?.delta?.thinking) {
                    return { content: obj.delta.thinking, isThinking: true };
                }
                // Handle streaming tool input JSON
                if (obj.delta?.type === 'input_json_delta') {
                    return {
                        toolCallDelta: {
                            index: obj.index,
                            content: obj.delta.partial_json
                        }
                    };
                }
                if (obj.delta?.type === 'signature_delta') {
                    return {
                        signature: obj.delta.signature, isThinking: true
                    }
                }
                const content = obj.delta?.text;
                if (content) {
                    return { content, isThinking: false };
                }
            } else if (obj.type === 'content_block_start') {
                if (["tool_use", 'mcp_tool_use', "server_tool_use"].includes(obj.content_block?.type)) {
                    return {
                        toolCall: {
                            name: obj.content_block.name,
                            input: obj.content_block.input,
                            server_name: obj.content_block.server_name,
                            id: obj.content_block.id,
                            is_server_call: obj.content_block.type !== "tool_use"
                        },
                        blockStart: {
                            index: obj.index,
                            type: obj.content_block.type
                        }
                    };
                }
                if (obj.content_block?.tool_use_id) {
                    return {
                        toolCallResult: {
                            id: obj.content_block.tool_use_id,
                            result: obj.content_block.content,
                            is_server_call: true
                        },
                    };
                }
                return {
                    blockStart: {
                        index: obj.index,
                        type: 'content'
                    }
                }
            } else if (obj.type === 'content_block_stop') {
                return {
                    blockComplete: {
                        index: obj.index
                    },
                };
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

    protected formatFile(file: LLMFile): any {
        switch (file.type) {
            case 'text':
                return {
                    type: 'document',
                    source: {
                        type: 'text',
                        data: file.content?.toString(),
                        media_type: file.mimeType || 'text/plain'
                    }
                };
            case 'image':
                return {
                    type: 'document',
                    source: {
                        type: 'base64',
                        media_type: file.mimeType || 'image/png',
                        data: file.content
                    }
                };
            case 'pdf':
                return {
                    type: 'document',
                    source: {
                        type: 'base64',
                        media_type: file.mimeType || 'application/pdf',
                        data: file.content
                    }
                };
            default:
                throw new Error(`Unsupported file type: ${file.type}`);
        }
    }

    protected formatMessage(message: ConversationTurn): any[] {
        const userMsg = {
            role: "user",
            content: [
                {
                    type: "text",
                    text: message.userInput.prompt
                },
                ...message.userInput.files?.map(this.formatFile) || []
            ]
        }
        const steps = message.steps.filter(step => step.content || step.thinking || Object.keys(step.toolCalls).length > 0).map(step => {
            if (!step.toolCalls || Object.keys(step.toolCalls).length === 0) {
                return [{
                    role: "assistant",
                    content: step.content
                }]
            }
            const thinking = step.thinking && {
                type: "thinking",
                thinking: step.thinking,
                signature: step.signature
            }
            return [
                {
                    role: "assistant",
                    content: [
                        thinking,
                        ...Object.values(step.toolCalls).map(toolCall => ({
                            type: "tool_use",
                            id: toolCall.id,
                            name: toolCall.name,
                            input: toolCall.input || {}
                        }))
                    ].filter(Boolean)
                },
                {
                    role: "user",
                    content: Object.values(step.toolCalls).map(toolCall => ({
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: JSON.stringify(toolCall.result)
                    }))
                }
            ]
        })
        return [userMsg, ...steps.flat()]
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
    private app: App;

    constructor(settings: NotesCriticSettings, app: App) {
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
        switch (toolCall?.name) {
            case 'str_replace_based_edit_tool':
                const textEditorTool = new ObsidianTextEditorTool(this.app);
                return textEditorTool.executeCommand(toolCall?.input as TextEditorCommand)
            default:
                throw new Error(`Unsupported tool call: ${toolCall?.name}`);
        }
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
                return OpenAIProvider.testApiKey(apiKey, app);
            case 'anthropic':
                return AnthropicProvider.testApiKey(apiKey, app);
            default:
                return false;
        }
    }
}