import { describe, it, expect, jest } from '@jest/globals';
import OpenAIProvider from '../../../src/llm/providers/OpenAI';
import { ConversationTurn, NotesCriticSettings } from '../../../src/types';
import { DEFAULT_SETTINGS } from '../../../src/constants';

class TestOpenAIProvider extends OpenAIProvider {
    protected validateApiKey(): void {
        // Skip API key validation in tests
    }

    protected getModel(): string {
        return 'gpt-4.1';
    }

    protected formatMessages(messages: ConversationTurn[]): any[] {
        return messages as any;
    }

    public createConfigPublic(
        messages: ConversationTurn[],
        systemPrompt: string,
        thinking: boolean,
        enabledTools: string[]
    ) {
        return this.createConfig(messages, systemPrompt, thinking, enabledTools);
    }
}

const createMessage = (): ConversationTurn[] => [
    {
        id: '1',
        timestamp: new Date(),
        userInput: {
            type: 'chat_message',
            message: 'Hi',
            prompt: 'Hi'
        },
        steps: [
            {
                toolCalls: {},
                content: 'Hello back!'
            }
        ],
        isComplete: true
    }
];

describe('OpenAIProvider tool configuration', () => {
    const mockApp: any = {
        vault: {
            getAbstractFileByPath: jest.fn(),
            read: jest.fn(),
            readBinary: jest.fn()
        }
    };

    it('includes the memory tool when enabled', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            model: 'openai/gpt-4.1',
            openaiApiKey: 'test-key',
            enabledTools: ['memory'],
            mcpClients: []
        } as NotesCriticSettings;

        const provider = new TestOpenAIProvider(settings, mockApp);
        const config = provider.createConfigPublic(createMessage(), 'system prompt', false, settings.enabledTools);

        expect(config.body.tools).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'function',
                    function: expect.objectContaining({
                        name: 'memory',
                        description: expect.any(String),
                        parameters: expect.any(Object)
                    })
                })
            ])
        );
    });

    it('omits the memory tool when not enabled', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            model: 'openai/gpt-4.1',
            openaiApiKey: 'test-key',
            enabledTools: ['web_browser'],
            mcpClients: []
        } as NotesCriticSettings;

        const provider = new TestOpenAIProvider(settings, mockApp);
        const config = provider.createConfigPublic(createMessage(), 'system prompt', false, settings.enabledTools);

        const memoryEntries = config.body.tools.filter(
            (tool: any) => tool?.function?.name === 'memory'
        );
        expect(memoryEntries).toHaveLength(0);
    });
});
