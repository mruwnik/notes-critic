export const MCP_AUTH_CALLBACK = 'mcp-auth-callback';


export const DEFAULT_SETTINGS = {
    feedbackThreshold: 3,
    feedbackCooldownSeconds: 30,
    systemPrompt: 'You are a helpful writing assistant. Provide constructive feedback on notes.',
    feedbackPrompt: `Please provide feedback on the changes made to "\${noteName}".

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