export interface NoteSnapshot {
    baseline: string;
    current: string;
    changeCount: number;
    lastFeedback: Date | null;
}

export interface FeedbackEntry {
    timestamp: Date;
    noteId: string;
    noteName: string;
    content: string;
    ai_message: string;
    diff: string;
    feedback: string;
    thinking?: string;
}

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

export interface LLMMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface LLMResponse {
    content: string;
    thinking?: string;
    isComplete: boolean;
    error?: string;
}

export interface LLMStreamChunk {
    type: 'thinking' | 'content' | 'error' | 'done';
    content: string;
    isComplete?: boolean;
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
    feedbackThreshold: 100,
    systemPrompt: 'You are a helpful writing assistant. Provide constructive feedback on notes.',
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
