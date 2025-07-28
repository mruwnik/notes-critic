import { jest, describe, it, expect } from '@jest/globals';
import { DEFAULT_SETTINGS } from '../../src/constants';
import { 
  CHAT_VIEW_CONFIG,
  NotesCriticSettings,
  ConversationTurn,
  UserInput,
  TurnStep,
  ToolCall,
  LLMFile,
  ChunkType,
  NotesCriticRule
} from '../../src/types';

describe('Types and Constants', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('should have all required settings properties', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('feedbackThreshold');
      expect(DEFAULT_SETTINGS).toHaveProperty('feedbackCooldownSeconds');
      expect(DEFAULT_SETTINGS).toHaveProperty('systemPrompt');
      expect(DEFAULT_SETTINGS).toHaveProperty('feedbackPrompt');
      expect(DEFAULT_SETTINGS).toHaveProperty('model');
      expect(DEFAULT_SETTINGS).toHaveProperty('anthropicApiKey');
      expect(DEFAULT_SETTINGS).toHaveProperty('openaiApiKey');
      expect(DEFAULT_SETTINGS).toHaveProperty('maxHistoryTokens');
      expect(DEFAULT_SETTINGS).toHaveProperty('maxTokens');
      expect(DEFAULT_SETTINGS).toHaveProperty('thinkingBudgetTokens');
      expect(DEFAULT_SETTINGS).toHaveProperty('mcpEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('mcpServers');
      expect(DEFAULT_SETTINGS).toHaveProperty('mcpMode');
    });

    it('should have sensible default values', () => {
      expect(DEFAULT_SETTINGS.feedbackThreshold).toBe(3);
      expect(DEFAULT_SETTINGS.feedbackCooldownSeconds).toBe(30);
      expect(DEFAULT_SETTINGS.model).toBe('anthropic/claude-3-sonnet-20240229');
      expect(DEFAULT_SETTINGS.maxTokens).toBe(2000);
      expect(DEFAULT_SETTINGS.maxHistoryTokens).toBe(4000);
      expect(DEFAULT_SETTINGS.thinkingBudgetTokens).toBe(1000);
      expect(DEFAULT_SETTINGS.mcpEnabled).toBe(false);
      expect(DEFAULT_SETTINGS.mcpMode).toBe('disabled');
      expect(Array.isArray(DEFAULT_SETTINGS.mcpServers)).toBe(true);
    });

    it('should have non-empty prompt templates', () => {
      expect(DEFAULT_SETTINGS.systemPrompt).toBeTruthy();
      expect(DEFAULT_SETTINGS.feedbackPrompt).toBeTruthy();
      expect(DEFAULT_SETTINGS.feedbackPrompt).toContain('${notePath}');
      expect(DEFAULT_SETTINGS.feedbackPrompt).toContain('${diff}');
    });
  });

  describe('CHAT_VIEW_CONFIG', () => {
    it('should have required view configuration properties', () => {
      expect(CHAT_VIEW_CONFIG).toHaveProperty('type');
      expect(CHAT_VIEW_CONFIG).toHaveProperty('name');
      expect(CHAT_VIEW_CONFIG).toHaveProperty('icon');
    });

    it('should have valid configuration values', () => {
      expect(CHAT_VIEW_CONFIG.type).toBe('notes-critic-chat');
      expect(CHAT_VIEW_CONFIG.name).toBe('Notes Critic Chat');
      expect(CHAT_VIEW_CONFIG.icon).toBe('message-square');
    });
  });

  describe('Interface type checking', () => {
    it('should validate NotesCriticSettings structure', () => {
      const validSettings: NotesCriticSettings = {
        ...DEFAULT_SETTINGS,
        anthropicApiKey: 'test-key'
      };

      expect(typeof validSettings.feedbackThreshold).toBe('number');
      expect(typeof validSettings.feedbackCooldownSeconds).toBe('number');
      expect(typeof validSettings.systemPrompt).toBe('string');
      expect(typeof validSettings.model).toBe('string');
      expect(typeof validSettings.mcpEnabled).toBe('boolean');
      expect(Array.isArray(validSettings.mcpServers)).toBe(true);
    });

    it('should validate UserInput union types', () => {
      const chatMessage: UserInput = {
        type: 'chat_message',
        message: 'test message',
        prompt: 'test prompt'
      };

      const fileChange: UserInput = {
        type: 'file_change',
        filename: 'test.md',
        diff: 'test diff',
        prompt: 'test prompt'
      };

      const manualFeedback: UserInput = {
        type: 'manual_feedback',
        filename: 'test.md',
        content: 'test content',
        prompt: 'test prompt'
      };

      expect(chatMessage.type).toBe('chat_message');
      expect(fileChange.type).toBe('file_change');
      expect(manualFeedback.type).toBe('manual_feedback');
    });

    it('should validate ConversationTurn structure', () => {
      const turn: ConversationTurn = {
        id: 'test-id',
        timestamp: new Date(),
        userInput: {
          type: 'chat_message',
          message: 'test',
          prompt: 'test'
        },
        steps: [],
        isComplete: false
      };

      expect(turn.id).toBe('test-id');
      expect(turn.timestamp).toBeInstanceOf(Date);
      expect(turn.userInput.type).toBe('chat_message');
      expect(Array.isArray(turn.steps)).toBe(true);
      expect(turn.isComplete).toBe(false);
    });

    it('should validate TurnStep structure', () => {
      const step: TurnStep = {
        thinking: 'test thinking',
        content: 'test content',
        toolCalls: {},
        signature: 'test signature'
      };

      expect(step.thinking).toBe('test thinking');
      expect(step.content).toBe('test content');
      expect(typeof step.toolCalls).toBe('object');
      expect(step.signature).toBe('test signature');
    });

    it('should validate ToolCall structure', () => {
      const toolCall: ToolCall = {
        id: 'call-123',
        name: 'test_tool',
        input: { param: 'value' },
        result: { output: 'result' }
      };

      expect(toolCall.id).toBe('call-123');
      expect(toolCall.name).toBe('test_tool');
      expect(toolCall.input).toEqual({ param: 'value' });
      expect(toolCall.result).toEqual({ output: 'result' });
    });

    it('should validate LLMFile union types', () => {
      const textFile: LLMFile = {
        type: 'text',
        path: 'test.md',
        content: 'file content',
        name: 'test.md'
      };

      const imageFile: LLMFile = {
        type: 'image',
        path: 'image.png',
        mimeType: 'image/png'
      };

      const pdfFile: LLMFile = {
        type: 'pdf',
        path: 'document.pdf',
        mimeType: 'application/pdf'
      };

      expect(textFile.type).toBe('text');
      expect(imageFile.type).toBe('image');
      expect(pdfFile.type).toBe('pdf');
    });

    it('should validate ChunkType values', () => {
      const validChunkTypes: ChunkType[] = [
        'thinking',
        'content', 
        'error',
        'done',
        'tool_call',
        'tool_call_result',
        'signature',
        'block'
      ];

      validChunkTypes.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });

    it('should validate NotesCriticRule structure', () => {
      const rule: NotesCriticRule = {
        name: 'Test Rule',
        enabled: true,
        priority: 100,
        globs: ['*.md'],
        exclude: ['temp*.md'],
        autoTrigger: true,
        feedbackThreshold: 5,
        feedbackCooldownSeconds: 60,
        feedbackPrompt: 'Custom prompt',
        systemPrompt: 'System prompt',
        model: 'anthropic/claude-3-sonnet-20240229',
        maxTokens: 2000,
        maxHistoryTokens: 4000,
        thinkingBudgetTokens: 1000,
        filePath: '/path/to/rule.md',
        content: 'Rule content'
      };

      expect(rule.name).toBe('Test Rule');
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(100);
      expect(Array.isArray(rule.globs)).toBe(true);
      expect(Array.isArray(rule.exclude)).toBe(true);
      expect(rule.autoTrigger).toBe(true);
      expect(rule.filePath).toBe('/path/to/rule.md');
      expect(rule.content).toBe('Rule content');
    });
  });
});