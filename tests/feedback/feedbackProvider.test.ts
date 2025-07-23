import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getFeedback, generateDiff } from '../../src/feedback/feedbackProvider';
import { ConversationTurn, NotesCriticSettings, DEFAULT_SETTINGS, LLMStreamChunk } from '../../src/types';
import { LLMProvider } from '../../src/llm/llmProvider';

// Mock LLMProvider
jest.mock('../../src/llm/llmProvider');

describe('feedbackProvider', () => {
  let mockApp: any;
  let mockSettings: NotesCriticSettings;

  beforeEach(() => {
    mockApp = {
      vault: { read: jest.fn(), write: jest.fn() },
      workspace: { getActiveFile: jest.fn() }
    };

    mockSettings = { ...DEFAULT_SETTINGS };
    
    jest.clearAllMocks();
  });

  describe('getFeedback', () => {
    it('should create LLMProvider and call LLM with history', async () => {
      const mockHistory: ConversationTurn[] = [
        {
          id: 'turn-1',
          timestamp: new Date(),
          userInput: { type: 'chat_message', message: 'test', prompt: 'test' },
          steps: [],
          isComplete: true
        }
      ];

      const mockResponse: LLMStreamChunk[] = [
        { type: 'content', content: 'Test response' },
        { type: 'done', content: '' }
      ];

      const mockCallLLM = jest.fn(async function* () {
        for (const chunk of mockResponse) {
          yield chunk;
        }
      });

      (LLMProvider as jest.Mock).mockImplementation(() => ({
        callLLM: mockCallLLM
      }));

      const results: LLMStreamChunk[] = [];
      for await (const chunk of getFeedback(mockHistory, mockSettings, mockApp)) {
        results.push(chunk);
      }

      expect(LLMProvider).toHaveBeenCalledWith(mockSettings, mockApp);
      expect(mockCallLLM).toHaveBeenCalledWith(mockHistory);
      expect(results).toEqual(mockResponse);
    });

    it('should handle empty history', async () => {
      const mockResponse: LLMStreamChunk[] = [
        { type: 'content', content: 'No history provided' }
      ];

      const mockCallLLM = jest.fn(async function* () {
        for (const chunk of mockResponse) {
          yield chunk;
        }
      });

      (LLMProvider as jest.Mock).mockImplementation(() => ({
        callLLM: mockCallLLM
      }));

      const results: LLMStreamChunk[] = [];
      for await (const chunk of getFeedback([], mockSettings, mockApp)) {
        results.push(chunk);
      }

      expect(mockCallLLM).toHaveBeenCalledWith([]);
      expect(results).toEqual(mockResponse);
    });

    it('should pass through LLM errors', async () => {
      const mockCallLLM = jest.fn(async function* () {
        throw new Error('LLM error');
      });

      (LLMProvider as jest.Mock).mockImplementation(() => ({
        callLLM: mockCallLLM
      }));

      const generator = getFeedback([], mockSettings, mockApp);
      await expect(generator.next()).rejects.toThrow('LLM error');
    });

    it('should handle streaming errors gracefully', async () => {
      const mockCallLLM = jest.fn(async function* () {
        yield { type: 'content', content: 'Partial response' };
        throw new Error('Stream interrupted');
      });

      (LLMProvider as jest.Mock).mockImplementation(() => ({
        callLLM: mockCallLLM
      }));

      const results: LLMStreamChunk[] = [];
      
      try {
        for await (const chunk of getFeedback([], mockSettings, mockApp)) {
          results.push(chunk);
        }
      } catch (error) {
        expect(error.message).toBe('Stream interrupted');
      }

      expect(results).toEqual([{ type: 'content', content: 'Partial response' }]);
    });
  });

  describe('generateDiff', () => {
    describe('basic functionality', () => {
      it('should return "No changes detected" for identical strings', () => {
        const text = 'line1\nline2\nline3';
        const result = generateDiff(text, text);
        expect(result).toBe('No changes detected');
      });

      it('should handle empty strings', () => {
        const result = generateDiff('', '');
        expect(result).toBe('No changes detected');
      });

      it('should detect simple line addition', () => {
        const baseline = 'line1\nline2';
        const current = 'line1\nline2\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('+line3');
        expect(result).toContain('@@');
      });

      it('should detect simple line removal', () => {
        const baseline = 'line1\nline2\nline3';
        const current = 'line1\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-line2');
        expect(result).toContain('@@');
      });

      it('should detect line modification', () => {
        const baseline = 'line1\noriginal line\nline3';
        const current = 'line1\nmodified line\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-original line');
        expect(result).toContain('+modified line');
      });
    });

    describe('complex changes', () => {
      it('should handle multiple changes in different areas', () => {
        const baseline = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';
        const current = 'line1\nmodified2\nline3\nline4\nnew5\nline6\nline7';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-line2');
        expect(result).toContain('+modified2');
        expect(result).toContain('-line5');
        expect(result).toContain('+new5');
      });

      it('should handle adding content to empty file', () => {
        const baseline = '';
        const current = 'new line 1\nnew line 2';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('+new line 1');
        expect(result).toContain('+new line 2');
      });

      it('should handle removing all content', () => {
        const baseline = 'line1\nline2\nline3';
        const current = '';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-line1');
        expect(result).toContain('-line2');
        expect(result).toContain('-line3');
      });

      it('should provide context lines around changes', () => {
        const baseline = 'line1\nline2\noriginal\nline4\nline5\nline6\nline7';
        const current = 'line1\nline2\nmodified\nline4\nline5\nline6\nline7';
        
        const result = generateDiff(baseline, current);
        
        // Should include context lines
        expect(result).toContain(' line1');
        expect(result).toContain(' line2');
        expect(result).toContain(' line4');
        expect(result).toContain(' line5');
        expect(result).toContain('-original');
        expect(result).toContain('+modified');
      });

      it('should merge nearby changes into single hunks', () => {
        const baseline = 'line1\nline2\nline3\nline4\nline5';
        const current = 'line1\nmodified2\nmodified3\nline4\nline5';
        
        const result = generateDiff(baseline, current);
        
        // Should be one hunk containing both changes
        const hunkCount = (result.match(/@@/g) || []).length / 2; // Each hunk has opening and closing @@
        expect(hunkCount).toBe(1);
      });

      it('should separate distant changes into multiple hunks', () => {
        const baseline = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';
        const current = 'modified1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nmodified10';
        
        const result = generateDiff(baseline, current);
        
        // Should be multiple hunks for distant changes
        const hunkCount = (result.match(/@@/g) || []).length / 2;
        expect(hunkCount).toBeGreaterThan(1);
      });
    });

    describe('edge cases', () => {
      it('should handle single line files', () => {
        const baseline = 'single line';
        const current = 'modified line';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-single line');
        expect(result).toContain('+modified line');
      });

      it('should handle files with only newlines', () => {
        const baseline = '\n\n\n';
        const current = '\n\n';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-');
      });

      it('should handle mixed line endings gracefully', () => {
        const baseline = 'line1\nline2\r\nline3';
        const current = 'line1\nmodified2\r\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-line2\r');
        expect(result).toContain('+modified2\r');
      });

      it('should handle very long lines', () => {
        const longLine = 'x'.repeat(1000);
        const baseline = `line1\n${longLine}\nline3`;
        const current = `line1\nmodified_${longLine}\nline3`;
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain(`-${longLine}`);
        expect(result).toContain(`+modified_${longLine}`);
      });

      it('should handle files with many lines', () => {
        const baselineLines = Array(1000).fill(0).map((_, i) => `line${i}`);
        const currentLines = [...baselineLines];
        currentLines[500] = 'modified_line500';
        
        const baseline = baselineLines.join('\n');
        const current = currentLines.join('\n');
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-line500');
        expect(result).toContain('+modified_line500');
        // Should include context around the change
        expect(result).toContain(' line497');
        expect(result).toContain(' line503');
      });

      it('should handle whitespace-only changes', () => {
        const baseline = 'line1\n  line2  \nline3';
        const current = 'line1\nline2\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-  line2  ');
        expect(result).toContain('+line2');
      });

      it('should handle unicode characters', () => {
        const baseline = 'line1\n中文测试\nline3';
        const current = 'line1\n中文修改\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-中文测试');
        expect(result).toContain('+中文修改');
      });

      it('should handle special characters and symbols', () => {
        const baseline = 'line1\n@#$%^&*()\nline3';
        const current = 'line1\n!@#$%^&*()\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-@#$%^&*()');
        expect(result).toContain('+!@#$%^&*()');
      });
    });

    describe('hunk formatting', () => {
      it('should include proper hunk headers', () => {
        const baseline = 'line1\nline2\nline3';
        const current = 'line1\nmodified\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
      });

      it('should format context lines with space prefix', () => {
        const baseline = 'line1\nline2\nline3\nline4\nline5';
        const current = 'line1\nline2\nmodified\nline4\nline5';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain(' line1');
        expect(result).toContain(' line2');
        expect(result).toContain(' line4');
        expect(result).toContain(' line5');
      });

      it('should format removed lines with minus prefix', () => {
        const baseline = 'line1\nto_remove\nline3';
        const current = 'line1\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('-to_remove');
      });

      it('should format added lines with plus prefix', () => {
        const baseline = 'line1\nline3';
        const current = 'line1\nto_add\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toContain('+to_add');
      });
    });

    describe('performance and edge cases', () => {
      it('should handle identical multi-line strings efficiently', () => {
        const lines = Array(10000).fill(0).map((_, i) => `line${i}`);
        const text = lines.join('\n');
        
        const startTime = Date.now();
        const result = generateDiff(text, text);
        const endTime = Date.now();
        
        expect(result).toBe('No changes detected');
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
      });

      it('should return "No changes detected" when no differences found after processing', () => {
        // This tests the case where hunks are generated but turn out to be empty
        const baseline = 'line1\nline2\nline3';
        const current = 'line1\nline2\nline3';
        
        const result = generateDiff(baseline, current);
        
        expect(result).toBe('No changes detected');
      });
    });
  });
});