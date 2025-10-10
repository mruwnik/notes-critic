import { Tool } from "llm/mcpClient";

export interface NoteSnapshot {
    baseline: string;
    current: string;
    changeCount: number;
}

export interface ToolCall {
    id: string;
    name: string;
    input: any;
    is_server_call: boolean;
    server_name?: string;
    result?: any;
}

export interface TurnChunk {
    type: 'thinking' | 'content' | 'tool_call' | 'tool_call_result' | 'signature' | 'block' | 'done';
    id: string | number;
    content: string;
    toolCall?: ToolCall;
}

export interface TurnStep {
    thinking?: string;
    content?: string;
    toolCalls: Record<string, ToolCall>;
    signature?: string;
    chunks?: TurnChunk[];
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
    summarizerModel: string;
    anthropicApiKey: string;
    openaiApiKey: string;
    maxHistoryTokens: number;
    maxTokens: number;
    thinkingBudgetTokens: number;
    mcpEnabled: boolean;
    mcpServers: MCPServerConfig[]; // Configuration for creating clients
    mcpClients: BaseMCPClient[]; // Actual client instances
    mcpServerUrl: string;
    mcpMode: 'disabled' | 'enabled';
    feedbackThreshold: number;
    feedbackCooldownSeconds: number;
    feedbackPrompt: string;
    logPath: string;
    memoryDirectory: string;
    enabledTools: string[];
}

export interface MCPServerConfig {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    transport: 'websocket' | 'stdio';
    args?: string[];
    env?: Record<string, string>;
    apiKey?: string;
}

export interface MCPServerState {
    config: MCPServerConfig;
    apiKey: string | null;
    tools: Tool[];
    authenticated: boolean;
}

export interface LLMFile {
    type: 'text' | 'image' | 'pdf' | 'folder';
    path: string;
    content?: string; // Optional for lazy loading
    mimeType?: string;
    name?: string;
    isFolder?: boolean; // True for folders
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

export interface ToolCallResult {
    id: string;
    result: any;
    is_server_call: boolean;
}


export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
}

export type ChunkType = 'thinking' | 'content' | 'error' | 'done' | 'tool_call' | 'tool_call_result' | 'signature' | 'block' | 'usage';
export interface LLMStreamChunk {
    type: ChunkType;
    id: string | number;
    content: string;
    isComplete?: boolean;
    toolCall?: ToolCall;
    toolCallResult?: ToolCallResult;
    tokenUsage?: TokenUsage;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    timestamp: Date;
    isStreaming?: boolean;
}

export const CHAT_VIEW_CONFIG = {
    type: 'notes-critic-chat',
    name: 'Notes Critic Chat',
    icon: 'message-square'
};

export interface NotesCriticRule {
    // Meta information
    name: string;
    enabled: boolean;
    priority: number;

    // File matching
    globs: string[];
    exclude?: string[];

    // Feedback behavior
    autoTrigger: boolean;
    feedbackThreshold?: number;
    feedbackCooldownSeconds?: number;

    // LLM configuration
    feedbackPrompt?: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    maxHistoryTokens?: number;
    thinkingBudgetTokens?: number;

    // Rule source info
    filePath: string;
    content: string; // The markdown content after frontmatter
}

export interface RuleMatch {
    rule: NotesCriticRule;
    matchedPattern: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

// Abstract base class for MCP clients to avoid circular dependencies
export abstract class BaseMCPClient {
    public abstract tools: Tool[];

    constructor(protected serverConfig: MCPServerConfig) { }

    abstract isEnabled(): boolean;
    abstract isAuthenticated(): boolean;
    abstract getName(): string;
    abstract getServerUrl(): string;
    abstract getServerId(): string;
    abstract getServerConfig(): MCPServerConfig;
    abstract getApiKey(): string | null;
    abstract getTools(forceRefresh?: boolean): Promise<Tool[]>;
    abstract hasTool(toolName: string): Promise<boolean>;
    abstract toolCall(toolName: string, args: Record<string, any>): Promise<any>;
    abstract testConnection(): Promise<boolean>;
}

