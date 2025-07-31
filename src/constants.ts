export const MCP_AUTH_CALLBACK = 'mcp-auth-callback';


export const DEFAULT_SETTINGS = {
    feedbackThreshold: 3,
    feedbackCooldownSeconds: 30,
    systemPrompt: 'You are a helpful writing assistant. Provide constructive feedback on notes.',
    feedbackPrompt: `Please provide feedback on the changes made to "\${notePath}".

The current note content is attached as a file for context.

Changes made:
\${diff}

Please provide constructive feedback focusing on the recent changes.`,
    model: 'anthropic/claude-3-sonnet-20240229',
    summarizerModel: 'anthropic/claude-3-5-haiku-latest',
    anthropicApiKey: '',
    openaiApiKey: '',
    maxHistoryTokens: 4000,
    maxTokens: 2000,
    thinkingBudgetTokens: 1000,
    mcpEnabled: false,
    mcpServers: [],
    mcpClients: [],
    mcpServerUrl: '',
    mcpMode: 'disabled' as const,
    logPath: '.notes-critic/conversations',
    enabledTools: []
};

export interface Model {
    name: string;
    thinking?: boolean;
    maxOutputTokens?: number;
}
const makeModel = ({ name, thinking, maxOutputTokens }: Model): Model => ({
    ...{ thinking: true, maxTokens: 1000000 },
    name,
    thinking,
    maxOutputTokens,
});
// Model choices that match the settings tab
export const AVAILABLE_MODELS = {
    'anthropic/claude-opus-4-20250514': makeModel({ name: 'Claude Opus 4', maxOutputTokens: 32000 }),
    'anthropic/claude-sonnet-4-20250514': makeModel({ name: 'Claude Sonnet 4', maxOutputTokens: 64000 }),
    'anthropic/claude-3-5-sonnet-latest': makeModel({ name: 'Claude 3.5 Sonnet', maxOutputTokens: 8192, thinking: false }),
    'anthropic/claude-3-7-sonnet-latest': makeModel({ name: 'Claude 3.7 Sonnet', maxOutputTokens: 100000 }),
    'anthropic/claude-3-5-haiku-latest': makeModel({ name: 'Claude 3.5 Haiku', maxOutputTokens: 8192, thinking: false }),

    'openai/gpt-4.1': makeModel({ name: 'GPT-4.1', maxOutputTokens: 32768 }),
    'openai/gpt-4.1-mini': makeModel({ name: 'GPT-4.1 Mini', maxOutputTokens: 32768 }),
    'openai/gpt-4.1-nano': makeModel({ name: 'GPT-4.1 Nano', maxOutputTokens: 32768 }),
    'openai/gpt-4.5-preview': makeModel({ name: 'GPT-4.5', maxOutputTokens: 32768 }),
    'openai/gpt-4o': makeModel({ name: 'GPT-4o', maxOutputTokens: 16384, thinking: false }),
    'openai/gpt-4o-mini': makeModel({ name: 'GPT-4o Mini', maxOutputTokens: 16384, thinking: false }),
    'openai/o1': makeModel({ name: 'O1', maxOutputTokens: 100000 }),
    'openai/o1-pro': makeModel({ name: 'O1 Pro', maxOutputTokens: 100000 }),
    'openai/o3-pro': makeModel({ name: 'O3 Pro', maxOutputTokens: 100000 }),
    'openai/o3': makeModel({ name: 'O3', maxOutputTokens: 100000 }),
    'openai/o4-mini': makeModel({ name: 'O4 Mini', maxOutputTokens: 100000 }),
    'openai/o3-mini': makeModel({ name: 'O3 Mini', maxOutputTokens: 100000 }),
    'openai/o1-mini': makeModel({ name: 'O1 Mini', maxOutputTokens: 100000 }),
};