import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { streamResponse, callRequestUrl, streamFromEndpoint, HttpConfig } from '../../src/llm/streaming';
import { requestUrl } from 'obsidian';

// Mock Obsidian requestUrl
jest.mock('obsidian', () => ({
  requestUrl: jest.fn()
}));

describe('Streaming Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('streamResponse', () => {
    let mockReader: any;
    let mockResponse: Response;

    beforeEach(() => {
      mockReader = {
        read: jest.fn(),
        releaseLock: jest.fn()
      };

      mockResponse = {
        body: {
          getReader: jest.fn(() => mockReader)
        }
      } as any;

      // Mock TextDecoder
      global.TextDecoder = jest.fn().mockImplementation(() => ({
        decode: jest.fn((chunk: Uint8Array, options?: { stream?: boolean }) => {
          // Convert Uint8Array to string for testing
          return String.fromCharCode.apply(null, Array.from(chunk));
        })
      }));
    });

    it('should stream text lines correctly', async () => {
      const testData = 'line1\nline2\nline3\n';
      const chunks = [
        new Uint8Array([...testData.slice(0, 8)].map(c => c.charCodeAt(0))),
        new Uint8Array([...testData.slice(8)].map(c => c.charCodeAt(0)))
      ];

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: chunks[0] })
        .mockResolvedValueOnce({ done: false, value: chunks[1] })
        .mockResolvedValueOnce({ done: true, value: undefined });

      const results: string[] = [];
      for await (const line of streamResponse(mockResponse)) {
        results.push(line);
      }

      expect(results).toEqual(['line1', 'line2', 'line3']);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle incomplete lines across chunks', async () => {
      const part1 = 'partial';
      const part2 = '_line\ncomplete_line\n';
      
      const chunks = [
        new Uint8Array([...part1].map(c => c.charCodeAt(0))),
        new Uint8Array([...part2].map(c => c.charCodeAt(0)))
      ];

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: chunks[0] })
        .mockResolvedValueOnce({ done: false, value: chunks[1] })
        .mockResolvedValueOnce({ done: true, value: undefined });

      const results: string[] = [];
      for await (const line of streamResponse(mockResponse)) {
        results.push(line);
      }

      expect(results).toEqual(['partial_line', 'complete_line']);
    });

    it('should skip empty lines', async () => {
      const testData = 'line1\n\nline2\n\n\nline3\n';
      const chunk = new Uint8Array([...testData].map(c => c.charCodeAt(0)));

      mockReader.read
        .mockResolvedValueOnce({ done: false, value: chunk })
        .mockResolvedValueOnce({ done: true, value: undefined });

      const results: string[] = [];
      for await (const line of streamResponse(mockResponse)) {
        results.push(line);
      }

      expect(results).toEqual(['line1', 'line2', 'line3']);
    });

    it('should handle response without body', async () => {
      const noBodyResponse = { body: null } as any;

      const generator = streamResponse(noBodyResponse);
      await expect(generator.next()).rejects.toThrow('Response body is not readable');
    });

    it('should handle response with undefined body', async () => {
      const undefinedBodyResponse = { body: undefined } as any;

      const generator = streamResponse(undefinedBodyResponse);
      await expect(generator.next()).rejects.toThrow('Response body is not readable');
    });

    it('should release reader lock on error', async () => {
      mockReader.read.mockRejectedValueOnce(new Error('Read error'));

      const generator = streamResponse(mockResponse);
      
      await expect(generator.next()).rejects.toThrow('Read error');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should handle reader that is null', async () => {
      mockResponse.body!.getReader = jest.fn(() => null);

      const generator = streamResponse(mockResponse);
      await expect(generator.next()).rejects.toThrow('Response body is not readable');
    });

    it('should handle decoder errors gracefully', async () => {
      const mockDecoder = {
        decode: jest.fn().mockImplementation(() => {
          throw new Error('Decode error');
        })
      };
      
      global.TextDecoder = jest.fn().mockImplementation(() => mockDecoder);

      const chunk = new Uint8Array([65, 66, 67]); // ABC
      mockReader.read
        .mockResolvedValueOnce({ done: false, value: chunk })
        .mockResolvedValueOnce({ done: true, value: undefined });

      const generator = streamResponse(mockResponse);
      await expect(generator.next()).rejects.toThrow('Decode error');
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });

  describe('callRequestUrl', () => {
    const config: HttpConfig = {
      url: 'https://api.example.com/test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { test: 'data' }
    };

    it('should make request and stream response', async () => {
      const mockText = 'response line 1\nresponse line 2\n';
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: mockText
      });

      const results: string[] = [];
      for await (const line of callRequestUrl(config)) {
        results.push(line);
      }

      expect(results).toEqual(['response line 1', 'response line 2']);
      expect(requestUrl).toHaveBeenCalledWith({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: JSON.stringify(config.body),
        throw: false
      });
    });

    it('should handle request without body', async () => {
      const getConfig: HttpConfig = {
        url: 'https://api.example.com/get'
      };

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: 'get response\n'
      });

      const results: string[] = [];
      for await (const line of callRequestUrl(getConfig)) {
        results.push(line);
      }

      expect(results).toEqual(['get response']);
      expect(requestUrl).toHaveBeenCalledWith({
        url: getConfig.url,
        method: 'GET',
        headers: {},
        body: undefined,
        throw: false
      });
    });

    it('should handle HTTP errors', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 404,
        text: 'Not Found'
      });

      const generator = callRequestUrl(config);
      await expect(generator.next()).rejects.toThrow('Request failed: 404 - Not Found');
    });

    it('should handle network errors', async () => {
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Network error'));

      const generator = callRequestUrl(config);
      await expect(generator.next()).rejects.toThrow('Network error');
    });

    it('should handle empty response text', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: ''
      });

      const results: string[] = [];
      for await (const line of callRequestUrl(config)) {
        results.push(line);
      }

      expect(results).toEqual([]);
    });

    it('should handle response with only newlines', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: '\n\n\n'
      });

      const results: string[] = [];
      for await (const line of callRequestUrl(config)) {
        results.push(line);
      }

      expect(results).toEqual([]);
    });
  });

  describe('streamFromEndpoint', () => {
    const config: HttpConfig = {
      url: 'https://api.example.com/stream',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { query: 'test' }
    };

    it('should parse JSON lines correctly', async () => {
      const jsonLines = [
        '{"type": "start", "data": "beginning"}',
        '{"type": "content", "data": "middle"}',
        '{"type": "end", "data": "finish"}'
      ];

      const mockRequestUrl = requestUrl as jest.Mock;
      mockRequestUrl.mockClear();
      mockRequestUrl.mockResolvedValue({
        status: 200,
        text: jsonLines.join('\n') + '\n'
      });

      const results: any[] = [];
      for await (const obj of streamFromEndpoint(config)) {
        results.push(obj);
      }

      expect(results).toEqual([
        { type: 'start', data: 'beginning' },
        { type: 'content', data: 'middle' },
        { type: 'end', data: 'finish' }
      ]);
    });

    it('should handle malformed JSON lines', async () => {
      const lines = [
        '{"valid": "json"}',
        'invalid json line',
        '{"another": "valid"}'
      ];

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: lines.join('\n') + '\n'
      });

      const results: any[] = [];
      const errors: any[] = [];

      try {
        for await (const obj of streamFromEndpoint(config)) {
          results.push(obj);
        }
      } catch (error) {
        errors.push(error);
      }

      expect(results).toEqual([{ valid: 'json' }]);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle empty JSON objects', async () => {
      const jsonLines = ['{}', '{"empty": null}', '{}'];

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: jsonLines.join('\n') + '\n'
      });

      const results: any[] = [];
      for await (const obj of streamFromEndpoint(config)) {
        results.push(obj);
      }

      expect(results).toEqual([{}, { empty: null }, {}]);
    });

    it('should handle large JSON objects', async () => {
      const largeObject = {
        type: 'large',
        data: 'x'.repeat(10000),
        nested: {
          array: Array(100).fill('item'),
          object: Object.fromEntries(Array(50).fill(0).map((_, i) => [`key${i}`, `value${i}`]))
        }
      };

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: JSON.stringify(largeObject) + '\n'
      });

      const results: any[] = [];
      for await (const obj of streamFromEndpoint(config)) {
        results.push(obj);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(largeObject);
    });

    it('should handle HTTP errors from underlying request', async () => {
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 500,
        text: 'Internal Server Error'
      });

      const generator = streamFromEndpoint(config);
      await expect(generator.next()).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should handle network errors from underlying request', async () => {
      (requestUrl as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const generator = streamFromEndpoint(config);
      await expect(generator.next()).rejects.toThrow('Connection refused');
    });

    it('should handle mixed valid and invalid JSON gracefully', async () => {
      const lines = [
        '{"start": true}',
        '',  // empty line should be skipped
        'not json',
        '{"middle": "value"}',
        '{"end": true}'
      ];

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: lines.join('\n') + '\n'
      });

      const results: any[] = [];
      const errors: any[] = [];

      try {
        for await (const obj of streamFromEndpoint(config)) {
          results.push(obj);
        }
      } catch (error) {
        errors.push(error);
      }

      // Should parse valid JSON and throw on invalid JSON
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toEqual({ start: true });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined config values', async () => {
      const minimalConfig = { url: 'https://api.example.com' };

      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: 'simple response\n'
      });

      const results: string[] = [];
      for await (const line of callRequestUrl(minimalConfig)) {
        results.push(line);
      }

      expect(results).toEqual(['simple response']);
      expect(requestUrl).toHaveBeenCalledWith({
        url: minimalConfig.url,
        method: 'GET',
        headers: {},
        body: undefined,
        throw: false
      });
    });

    it('should handle very long lines', async () => {
      const longLine = 'x'.repeat(100000);
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: longLine + '\n'
      });

      const results: string[] = [];
      for await (const line of callRequestUrl({ url: 'https://test.com' })) {
        results.push(line);
      }

      expect(results).toEqual([longLine]);
      expect(results[0].length).toBe(100000);
    });

    it('should handle responses with different line endings', async () => {
      const mixedLineEndings = 'line1\nline2\r\nline3\rline4\n';
      (requestUrl as jest.Mock).mockResolvedValue({
        status: 200,
        text: mixedLineEndings
      });

      const results: string[] = [];
      for await (const line of callRequestUrl({ url: 'https://test.com' })) {
        results.push(line);
      }

      // Only \n is handled as line separator
      expect(results).toContain('line1');
      expect(results).toContain('line4');
    });
  });
});