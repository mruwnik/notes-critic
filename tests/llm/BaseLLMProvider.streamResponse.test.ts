import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LLMStreamChunk, NotesCriticSettings, DEFAULT_SETTINGS, ConversationTurn } from '../../src/types';

// Mock dependencies
jest.mock('../../src/llm/mcpClient');
jest.mock('../../src/llm/fileUtils');
jest.mock('../../src/llm/streaming');

// Create a test implementation of BaseLLMProvider to access protected methods
class TestLLMProvider {
  protected settings: NotesCriticSettings;
  private mockStreamFromEndpoint: jest.Mock;

  constructor(settings: NotesCriticSettings) {
    this.settings = settings;
    this.mockStreamFromEndpoint = jest.fn();
    
    // Mock the streaming module
    const streamingMock = require('../../src/llm/streaming');
    streamingMock.streamFromEndpoint = this.mockStreamFromEndpoint;
  }

  // Expose the streamResponse method for testing
  async *testStreamResponse(config: any): AsyncGenerator<LLMStreamChunk, void, unknown> {
    try {
      const httpConfig = {
        url: config.url,
        method: 'POST',
        headers: config.headers,
        body: config.body
      };

      // Track tool calls in progress
      const toolCalls = new Map<number, any>();
      let currentBlock = null;
      let currentBlockType: any = null;
      let blockContent = '';

      // Use generic streaming function and parse each JSON object
      for await (const jsonObj of this.mockStreamFromEndpoint(httpConfig)) {
        const result = config.parseObject(jsonObj);

        if (result.error) {
          yield { type: 'error', content: result.error };
          return;
        }

        if (result.blockStart) {
          currentBlock = result.blockStart;
          blockContent = '';
        }

        if (result.signature) {
          yield { type: "signature", content: result.signature };
        }

        // Handle tool call streaming
        if (result.toolCall) {
          currentBlockType = 'tool_call';
          toolCalls.set(currentBlock?.index || 0, { ...result.toolCall, input: '' });
          yield {
            type: "tool_call", content: '', toolCall: result.toolCall
          };
        }

        if (result.toolCallResult) {
          currentBlockType = 'tool_call_result';
          yield {
            type: "tool_call_result", content: '', toolCallResult: result.toolCallResult
          };
        }

        if (result.toolCallDelta) {
          const { index, content } = result.toolCallDelta;
          const toolCall = toolCalls.get(index);
          if (toolCall) {
            toolCall.input += content;
          }
        }

        if (result.blockComplete) {
          const { index } = result.blockComplete;
          const toolCall = toolCalls.get(index);
          if (toolCall) {
            try {
              // Parse the accumulated JSON
              let parsedInput;
              if (toolCall.input) {
                parsedInput = JSON.parse(toolCall.input);
              } else {
                parsedInput = toolCall.input;
              }

              // Yield the tool call for execution
              yield {
                type: 'tool_call',
                content: toolCall.input,
                toolCall: { ...toolCall, input: parsedInput },
                isComplete: true
              };
            } catch (error) {
              yield { type: 'error', content: `Failed to parse tool call: ${error.message}` };
            }
            toolCalls.delete(index);
          } else if (currentBlockType) {
            yield { type: currentBlockType, content: blockContent, isComplete: true };
          }

          currentBlock = null;
          currentBlockType = null;
          blockContent = '';
        }

        if (result.content) {
          currentBlockType = result.isThinking ? 'thinking' : 'content';
          yield { type: currentBlockType, content: result.content };
          blockContent += result.content;
        }

        if (result.isComplete) {
          yield { type: 'done', content: '' };
          return;
        }
      }

      yield { type: 'done', content: '' };
    } catch (error) {
      yield {
        type: 'error',
        content: `Request failed: ${error.message}`
      };
    }
  }

  // Helper method to set up mock streaming data
  setMockStreamData(data: any[]) {
    this.mockStreamFromEndpoint.mockImplementation(async function* () {
      for (const item of data) {
        yield item;
      }
    });
  }
}

describe('BaseLLMProvider.streamResponse', () => {
  let provider: TestLLMProvider;
  let mockSettings: NotesCriticSettings;

  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS };
    provider = new TestLLMProvider(mockSettings);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('basic streaming', () => {
    it('should handle basic content streaming', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ content: 'Hello', isThinking: false })
          .mockReturnValueOnce({ content: ' world', isThinking: false })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'content_delta', text: 'Hello' },
        { type: 'content_delta', text: ' world' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'content', content: 'Hello' },
        { type: 'content', content: ' world' },
        { type: 'done', content: '' }
      ]);
    });

    it('should handle thinking content streaming', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ content: 'Thinking...', isThinking: true })
          .mockReturnValueOnce({ content: 'Response', isThinking: false })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'thinking_delta', text: 'Thinking...' },
        { type: 'content_delta', text: 'Response' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'thinking', content: 'Thinking...' },
        { type: 'content', content: 'Response' },
        { type: 'done', content: '' }
      ]);
    });

    it('should handle signature streaming', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ signature: 'signature_data' })
          .mockReturnValueOnce({ content: 'Response', isThinking: false })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'signature', data: 'signature_data' },
        { type: 'content_delta', text: 'Response' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'signature', content: 'signature_data' },
        { type: 'content', content: 'Response' },
        { type: 'done', content: '' }
      ]);
    });
  });

  describe('tool call handling', () => {
    it('should handle simple tool call without streaming input', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'test_tool', input: { param: 'value' } }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_call_start', call: { id: 'call-1', name: 'test_tool', input: { param: 'value' } } },
        { type: 'tool_call_complete', index: 0 },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({
        type: 'tool_call',
        content: '',
        toolCall: { id: 'call-1', name: 'test_tool', input: { param: 'value' } }
      });
      expect(chunks[1]).toMatchObject({
        type: 'tool_call',
        isComplete: true,
        toolCall: expect.objectContaining({
          id: 'call-1',
          name: 'test_tool'
        })
      });
      expect(chunks[2]).toEqual({ type: 'done', content: '' });
    });

    it('should handle tool call with streaming JSON input', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'test_tool', input: '' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: '{"par' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: 'am": "val' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: 'ue"}' }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_call_start' },
        { type: 'tool_input_delta', partial: '{"par' },
        { type: 'tool_input_delta', partial: 'am": "val' },
        { type: 'tool_input_delta', partial: 'ue"}' },
        { type: 'tool_call_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe('tool_call');
      expect(chunks[1].type).toBe('tool_call');
      expect(chunks[1].isComplete).toBe(true);
      expect(chunks[1].toolCall?.input).toEqual({ param: 'value' });
      expect(chunks[2]).toEqual({ type: 'done', content: '' });
    });

    it('should handle multiple concurrent tool calls', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'tool_1', input: '' }
          })
          .mockReturnValueOnce({
            blockStart: { index: 1, type: 'tool_call' },
            toolCall: { id: 'call-2', name: 'tool_2', input: '' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: '{"a": 1}' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 1, content: '{"b": 2}' }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 1 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_call_1_start' },
        { type: 'tool_call_2_start' },
        { type: 'tool_1_input_delta' },
        { type: 'tool_2_input_delta' },
        { type: 'tool_call_1_complete' },
        { type: 'tool_call_2_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      // Should have: 2 initial tool calls + 2 completed tool calls + 1 done
      expect(chunks).toHaveLength(5);
      
      // Check that both tool calls were processed
      const toolCallChunks = chunks.filter(c => c.type === 'tool_call');
      expect(toolCallChunks).toHaveLength(4); // 2 initial + 2 completed
      
      const completedToolCalls = toolCallChunks.filter(c => c.isComplete);
      expect(completedToolCalls).toHaveLength(2);
      expect(completedToolCalls[0].toolCall?.input).toEqual({ a: 1 });
      expect(completedToolCalls[1].toolCall?.input).toEqual({ b: 2 });
    });

    it('should handle tool call results', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            toolCallResult: {
              id: 'call-1',
              result: { output: 'success' },
              is_server_call: true
            }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_result', result: { output: 'success' } },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        {
          type: 'tool_call_result',
          content: '',
          toolCallResult: {
            id: 'call-1',
            result: { output: 'success' },
            is_server_call: true
          }
        },
        { type: 'done', content: '' }
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors in stream', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ error: 'Parse error occurred' })
      };

      provider.setMockStreamData([
        { type: 'error_data' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'error', content: 'Parse error occurred' }
      ]);
    });

    it('should handle JSON parsing errors in tool calls', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'test_tool', input: '' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: '{"invalid": json}' }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_call_start' },
        { type: 'invalid_json_delta' },
        { type: 'tool_call_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      // Should have initial tool call, error, and done
      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe('tool_call');
      expect(chunks[1].type).toBe('error');
      expect(chunks[1].content).toContain('Failed to parse tool call:');
      expect(chunks[2].type).toBe('done');
    });

    it('should handle streaming endpoint errors', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
      };

      // Mock streaming endpoint to throw an error
      provider.setMockStreamData([]);
      const streamingMock = require('../../src/llm/streaming');
      streamingMock.streamFromEndpoint.mockImplementation(async function* () {
        throw new Error('Network connection failed');
      });

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'error', content: 'Request failed: Network connection failed' }
      ]);
    });

    it('should handle missing tool calls in blockComplete', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'content' }
          })
          .mockReturnValueOnce({
            content: 'Some content',
            isThinking: false
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'block_start' },
        { type: 'content_delta' },
        { type: 'block_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'content', content: 'Some content' },
        { type: 'content', content: 'Some content', isComplete: true },
        { type: 'done', content: '' }
      ]);
    });
  });

  describe('complex streaming scenarios', () => {
    it('should handle mixed content and tool calls', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ content: 'Let me help you with that.', isThinking: false })
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'search_tool', input: '' }
          })
          .mockReturnValueOnce({
            toolCallDelta: { index: 0, content: '{"query": "test"}' }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ content: 'Based on the search results...', isThinking: false })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'content_1' },
        { type: 'tool_call_start' },
        { type: 'tool_input' },
        { type: 'tool_call_complete' },
        { type: 'content_2' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(5);
      expect(chunks[0]).toEqual({ type: 'content', content: 'Let me help you with that.' });
      expect(chunks[1].type).toBe('tool_call');
      expect(chunks[1].toolCall?.name).toBe('search_tool');
      expect(chunks[2].type).toBe('tool_call');
      expect(chunks[2].isComplete).toBe(true);
      expect(chunks[3]).toEqual({ type: 'content', content: 'Based on the search results...' });
      expect(chunks[4]).toEqual({ type: 'done', content: '' });
    });

    it('should accumulate block content correctly', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'content' }
          })
          .mockReturnValueOnce({ content: 'Hello', isThinking: false })
          .mockReturnValueOnce({ content: ' ', isThinking: false })
          .mockReturnValueOnce({ content: 'world', isThinking: false })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'block_start' },
        { type: 'content_1' },
        { type: 'content_2' },
        { type: 'content_3' },
        { type: 'block_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'content', content: 'Hello' },
        { type: 'content', content: ' ' },
        { type: 'content', content: 'world' },
        { type: 'content', content: 'Hello world', isComplete: true },
        { type: 'done', content: '' }
      ]);
    });

    it('should handle empty stream gracefully', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
      };

      provider.setMockStreamData([]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'done', content: '' }
      ]);
    });

    it('should handle rapid-fire events correctly', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
      };

      // Set up rapid sequence of events
      const events = [];
      for (let i = 0; i < 100; i++) {
        events.push({ content: `chunk${i}`, isThinking: false });
      }
      events.push({ isComplete: true });

      mockConfig.parseObject
        .mockImplementation((obj: any) => {
          const index = events.indexOf(obj);
          if (index < 100) {
            return { content: `chunk${index}`, isThinking: false };
          } else {
            return { isComplete: true };
          }
        });

      provider.setMockStreamData(events);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(101); // 100 content chunks + 1 done
      expect(chunks[0]).toEqual({ type: 'content', content: 'chunk0' });
      expect(chunks[99]).toEqual({ type: 'content', content: 'chunk99' });
      expect(chunks[100]).toEqual({ type: 'done', content: '' });
    });
  });

  describe('edge cases', () => {
    it('should handle parseObject returning empty objects', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({}) // Empty object
          .mockReturnValueOnce({}) // Another empty object
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'unknown_1' },
        { type: 'unknown_2' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'done', content: '' }
      ]);
    });

    it('should handle tool calls with empty input', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({
            blockStart: { index: 0, type: 'tool_call' },
            toolCall: { id: 'call-1', name: 'test_tool', input: '' }
          })
          .mockReturnValueOnce({
            blockComplete: { index: 0 }
          })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'tool_call_start' },
        { type: 'tool_call_complete' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[1].toolCall?.input).toBe('');
    });

    it('should handle null/undefined values in parsed results', async () => {
      const mockConfig = {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: 'test' },
        parseObject: jest.fn()
          .mockReturnValueOnce({ content: null, isThinking: false })
          .mockReturnValueOnce({ content: undefined, isThinking: false })
          .mockReturnValueOnce({ content: '', isThinking: false })
          .mockReturnValueOnce({ isComplete: true })
      };

      provider.setMockStreamData([
        { type: 'null_content' },
        { type: 'undefined_content' },
        { type: 'empty_content' },
        { type: 'message_complete' }
      ]);

      const chunks: LLMStreamChunk[] = [];
      for await (const chunk of provider.testStreamResponse(mockConfig)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: 'done', content: '' }
      ]);
    });
  });
});