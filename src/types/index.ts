export interface NoteSnapshot {
    baseline: string;
    current: string;
    changeCount: number;
}

export interface ToolCall {
    id: string;
    name: string;
    input: any;
    result?: any;
}

export interface TurnStep {
    thinking?: string;
    content?: string;
    toolCalls: Record<string, ToolCall>;
    signature?: string;
}

export interface ConversationTurn {
    id: string;
    timestamp: Date;
    userInput: UserInput;
    steps: TurnStep[];
    isComplete: boolean;
    error?: string;
}

export type UserInput =
    | { type: 'file_change'; filename: string; diff: string; prompt: string; files?: LLMFile[] }
    | { type: 'chat_message'; message: string; prompt: string; files?: LLMFile[] }
    | { type: 'manual_feedback'; filename: string; content: string; prompt: string; files?: LLMFile[] }

export interface NotesCriticSettings {
    systemPrompt: string;
    model: string;
    anthropicApiKey: string;
    openaiApiKey: string;
    maxHistoryTokens: number;
    maxTokens: number;
    thinkingBudgetTokens: number;
    mcpEnabled: boolean;
    mcpServers: MCPServerConfig[];
    mcpServerUrl?: string;
    mcpMode: 'disabled' | 'enabled' | 'required';
    feedbackThreshold: number;
    feedbackCooldownSeconds: number;
    feedbackPrompt: string;
}

export interface MCPServerConfig {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    transport: 'websocket' | 'stdio';
    args?: string[];
    env?: Record<string, string>;
}

export interface LLMFile {
    type: 'text' | 'image' | 'pdf';
    path: string;
    content?: Buffer;
    mimeType?: string;
    name?: string;
}

export interface LLMMessage {
    role: 'user' | 'assistant' | 'system';
    call_id?: string;
    content?: any;
    files?: LLMFile[];
    output?: any;
    toolCalls?: Record<string, ToolCall>;
}

export interface LLMResponse {
    content: string;
    thinking?: string;
    isComplete: boolean;
    error?: string;
}

export type ChunkType = 'thinking' | 'content' | 'error' | 'done' | 'tool_call' | 'tool_call_result' | 'signature';
export interface LLMStreamChunk {
    type: ChunkType;
    content: string;
    isComplete?: boolean;
    toolCall?: {
        name: string;
        input: any;
        id: string;
    };
    toolCallResult?: {
        id: string;
        result: any;
    };
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    timestamp: Date;
    isStreaming?: boolean;
}

export const DEFAULT_SETTINGS: NotesCriticSettings = {
    feedbackThreshold: 3,
    feedbackCooldownSeconds: 30,
    systemPrompt: 'You are a helpful writing assistant. Provide constructive feedback on notes.',
    feedbackPrompt: `Please provide feedback on the changes made to "\${noteName}".

The current note content is attached as a file for context.

Changes made:
\${diff}

Please provide constructive feedback focusing on the recent changes.`,
    model: 'anthropic/claude-3-sonnet-20240229',
    anthropicApiKey: '',
    openaiApiKey: '',
    maxHistoryTokens: 4000,
    maxTokens: 2000,
    thinkingBudgetTokens: 1000,
    mcpEnabled: false,
    mcpServers: [],
    mcpServerUrl: '',
    mcpMode: 'disabled' as const
};

export const CHAT_VIEW_CONFIG = {
    type: 'notes-critic-chat',
    name: 'Notes Critic Chat',
    icon: 'message-square'
};
