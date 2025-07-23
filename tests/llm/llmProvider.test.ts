import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LLMProvider } from '../../src/llm/llmProvider';
import { NotesCriticSettings, DEFAULT_SETTINGS, ConversationTurn, LLMFile } from '../../src/types';

// Mock dependencies
jest.mock('../../src/llm/mcpClient');
jest.mock('../../src/llm/fileUtils');
jest.mock('../../src/llm/tools');
jest.mock('../../src/llm/streaming');

// Mock Obsidian modules
jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
  Notice: jest.fn(),
}));

describe('LLMProvider', () => {
  let provider: LLMProvider;
  let mockApp: any;
  let mockSettings: NotesCriticSettings;

  beforeEach(() => {
    mockApp = {
      workspace: { getActiveFile: jest.fn() },
      vault: { 
        read: jest.fn(),
        getAbstractFileByPath: jest.fn(),
        create: jest.fn(),
        modify: jest.fn(),
        readBinary: jest.fn(),
        getFiles: jest.fn(() => [])
      }
    };
    
    mockSettings = {
      ...DEFAULT_SETTINGS,
      anthropicApiKey: 'test-key',
      model: 'anthropic/claude-3-sonnet-20240229'
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with anthropic model', () => {
      expect(() => new LLMProvider(mockSettings, mockApp)).not.toThrow();
    });

    it('should create provider with openai model', () => {
      const openaiSettings = {
        ...mockSettings,
        model: 'openai/gpt-4',
        openaiApiKey: 'openai-key'
      };
      
      expect(() => new LLMProvider(openaiSettings, mockApp)).not.toThrow();
    });

    it('should throw error for unsupported provider', () => {
      const invalidSettings = {
        ...mockSettings,
        model: 'unsupported/model'
      };
      
      expect(() => new LLMProvider(invalidSettings, mockApp))
        .toThrow('Unsupported LLM provider: unsupported');
    });
  });

  describe('runToolCall', () => {
    let mockExecuteCommand: jest.Mock;

    beforeEach(() => {
      // Access the shared mock from the mock module
      const toolsMock = require('../../src/llm/tools');
      mockExecuteCommand = toolsMock.__mockExecuteCommand;
      
      // Clear any previous calls
      if (mockExecuteCommand?.mockClear) {
        mockExecuteCommand.mockClear();
      }
      
      provider = new LLMProvider(mockSettings, mockApp);
    });

    it.skip('should handle text editor tool calls', async () => {
      const mockToolCall = {
        type: 'tool_call' as const,
        content: '',
        toolCall: {
          name: 'str_replace_based_edit_tool',
          input: {
            command: 'str_replace',
            path: 'test.md',
            old_str: 'old text',
            new_str: 'new text'
          },
          id: 'call-1'
        }
      };

      const result = await provider.runToolCall(mockToolCall);

      expect(mockExecuteCommand).toHaveBeenCalledWith(mockToolCall.toolCall?.input);
      expect(result).toEqual({ success: true });
    });

    it('should throw error for unsupported tool calls', async () => {
      const mockToolCall = {
        type: 'tool_call' as const,
        content: '',
        toolCall: {
          name: 'unsupported_tool',
          input: {},
          id: 'call-1'
        }
      };

      await expect(provider.runToolCall(mockToolCall))
        .rejects.toThrow('Unsupported tool call: unsupported_tool');
    });
  });

  describe('updateSettings', () => {
    beforeEach(() => {
      provider = new LLMProvider(mockSettings, mockApp);
    });

    it('should update provider when settings change', () => {
      const newSettings = {
        ...mockSettings,
        model: 'openai/gpt-4',
        openaiApiKey: 'new-key'
      };

      expect(() => provider.updateSettings(newSettings, mockApp)).not.toThrow();
    });
  });

  describe('testApiKey', () => {
    it('should test anthropic API key', async () => {
      const { requestUrl } = require('obsidian');
      requestUrl.mockResolvedValue({ status: 200, json: {} });

      const result = await LLMProvider.testApiKey('test-key', 'anthropic', mockApp);
      
      expect(requestUrl).toHaveBeenCalledWith({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key'
        }),
        body: expect.any(String),
        throw: false
      });
    });

    it('should test openai API key', async () => {
      const { requestUrl } = require('obsidian');
      requestUrl.mockResolvedValue({ status: 200, json: {} });

      const result = await LLMProvider.testApiKey('test-key', 'openai', mockApp);
      
      expect(requestUrl).toHaveBeenCalledWith({
        url: 'https://api.openai.com/v1/responses',
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key'
        }),
        body: expect.any(String),
        throw: false
      });
    });

    it('should return false for unsupported provider', async () => {
      const result = await LLMProvider.testApiKey('test-key', 'unsupported' as any, mockApp);
      expect(result).toBe(false);
    });

    it('should handle API errors', async () => {
      const { requestUrl } = require('obsidian');
      requestUrl.mockResolvedValue({ status: 401, json: { error: 'Invalid API key' } });

      const result = await LLMProvider.testApiKey('invalid-key', 'anthropic', mockApp);
      expect(result).toBe(false);
    });

    it('should handle network errors', async () => {
      const { requestUrl } = require('obsidian');
      requestUrl.mockRejectedValue(new Error('Network error'));

      const result = await LLMProvider.testApiKey('test-key', 'anthropic', mockApp);
      expect(result).toBe(false);
    });
  });
});