import { BaseLLMProvider, ProviderConfig, StreamParseResult } from "llm/providers/Base";
import { ToolDefinition } from "types";
import { browserToolDefinition } from "llm/tools";
import { MCPClient } from "llm/mcpClient";
import { ConversationTurn } from "types";
import { NotesCriticSettings } from "types";
import { LLMFile } from "types";


// Anthropic provider implementation
export class AnthropicProvider extends BaseLLMProvider {
    protected getDefaultTools(model: string): Record<string, any>[] {
        const toTool = ({ name, description, parameters }: ToolDefinition) => ({ name, description, input_schema: parameters })

        const baseTools = [toTool(browserToolDefinition)]

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
            return baseTools
        }
        if (no_editor.includes(model)) {
            return [webSearchTool, ...baseTools]
        }

        return [webSearchTool, textEditorTool, ...baseTools]
    }

    protected supportsMCP(model: string): boolean {
        return !model.includes('claude-3')
    }

    protected getTools(config: Record<string, any>, enabledTools: string[]): Record<string, any> {
        const model = this.getModel()
        const availableTools = this.getDefaultTools(model).filter(tool => enabledTools.includes(tool.name))
        const extras: any = { tools: availableTools }

        const extractTools = (client: MCPClient) => {
            const tools = client.tools.map(tool => tool.name).filter(tool => enabledTools.includes(tool))
            if (tools.length === 0) {
                return null
            }
            return {
                name: client.getName(),
                url: client.getServerUrl(),
                type: "url",
                authorization_token: client.getApiKey(),
                tool_configuration: {
                    enabled: true,
                    allowed_tools: tools
                },
            }
        }

        if (enabledTools && enabledTools.length > 0 && this.supportsMCP(model)) {
            extras.mcp_servers = this.settings.mcpClients?.filter(client => client.isAuthenticated())
                .map(extractTools)
                .filter(Boolean) || [];
        }
        return { ...config, ...extras, }
    }

    protected createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, enabledTools: string[]): ProviderConfig {
        this.validateApiKey();
        const formattedMessages = this.formatMessages(messages);
        const wrappedMessages = this.wrapMessages(formattedMessages);

        const extras = this.getTools({}, enabledTools)
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

export default AnthropicProvider;