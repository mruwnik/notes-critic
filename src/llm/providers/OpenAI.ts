import { BaseLLMProvider, ProviderConfig, StreamParseResult } from "llm/providers/Base";
import { browserToolDefinition, textEditorToolDefinition } from "llm/tools";
import { ConversationTurn } from "types";
import { NotesCriticSettings } from "types";
import { LLMFile } from "types";

// OpenAI provider implementation
export class OpenAIProvider extends BaseLLMProvider {
    protected createConfig(messages: ConversationTurn[], systemPrompt: string, thinking: boolean, enabledTools: string[]): ProviderConfig {
        this.validateApiKey();
        const extras: any = {}

        // Add text editor tool
        const baseTools = [{ ...browserToolDefinition, type: 'function' }, { ...textEditorToolDefinition, type: 'function' }]
            .filter(tool => enabledTools.includes(tool.name));
        extras.tools = baseTools;

        if (enabledTools && enabledTools.length > 0) {
            // Add MCP configurations for each enabled server
            const mcpConfigs = this.settings.mcpClients?.filter(client => client.isAuthenticated())
                .map(client => {
                    const clientTools = client.tools
                        .filter(tool => enabledTools.includes(tool.name))
                        .map(tool => tool.name);

                    if (clientTools.length === 0) return null;

                    return {
                        type: "mcp",
                        server_label: client.getName(),
                        server_url: client.getServerUrl(),
                        headers: {
                            Authorization: `Bearer ${client.getApiKey()}`
                        },
                        allowed_tools: clientTools,
                        require_approval: {
                            never: {
                                tool_names: clientTools
                            }
                        }
                    };
                })
                .filter(Boolean) || [];

            extras.tools.push(...mcpConfigs);
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

export default OpenAIProvider;