import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ObsidianFileProcessor } from '../../src/llm/fileUtils';
import { LLMFile } from '../../src/types';
import { TFile } from 'obsidian';

describe('ObsidianFileProcessor', () => {
  let processor: ObsidianFileProcessor;
  let mockApp: any;
  let mockVault: any;

  beforeEach(() => {
    mockVault = {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
      readBinary: jest.fn(),
      create: jest.fn(),
      modify: jest.fn()
    };

    mockApp = {
      vault: mockVault
    };

    processor = new ObsidianFileProcessor(mockApp);

    // Mock btoa for base64 encoding
    global.btoa = jest.fn((str: string) => Buffer.from(str, 'binary').toString('base64'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with app instance', () => {
      expect(processor['app']).toBe(mockApp);
    });
  });

  describe('processLLMFile - text files', () => {
    it('should read text file content when not provided', async () => {
      const mockTFile = new TFile();
      const testContent = '# Test Note\n\nThis is test content.';
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(testContent);

      const inputFile: LLMFile = {
        type: 'text',
        path: 'test.md'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result).toEqual({
        type: 'text',
        path: 'test.md',
        content: testContent,
        name: 'test.md'
      });
      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith('test.md');
      expect(mockVault.read).toHaveBeenCalledWith(mockTFile);
    });

    it('should preserve existing content when provided', async () => {
      const existingContent = 'Existing content';
      const inputFile: LLMFile = {
        type: 'text',
        path: 'test.md',
        content: existingContent
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result).toEqual({
        type: 'text',
        path: 'test.md',
        content: existingContent,
        name: 'test.md'
      });
      expect(mockVault.getAbstractFileByPath).not.toHaveBeenCalled();
    });

    it('should throw error when text file not found', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const inputFile: LLMFile = {
        type: 'text',
        path: 'nonexistent.md'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Failed to read note nonexistent.md: Note not found: nonexistent.md');
    });

    it('should throw error when text file is not a TFile', async () => {
      const mockFolder = { name: 'folder' }; // Not a TFile
      mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

      const inputFile: LLMFile = {
        type: 'text',
        path: 'folder'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Failed to read note folder: Note not found: folder');
    });

    it('should handle vault read errors', async () => {
      const mockTFile = new TFile();
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockRejectedValue(new Error('Permission denied'));

      const inputFile: LLMFile = {
        type: 'text',
        path: 'test.md'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Failed to read note test.md: Permission denied');
    });
  });

  describe('processLLMFile - image files', () => {
    it('should read and encode image file when content not provided', async () => {
      const mockTFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(4);
      const view = new Uint8Array(mockArrayBuffer);
      view[0] = 137; // PNG header start
      view[1] = 80;  // P
      view[2] = 78;  // N
      view[3] = 71;  // G

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'test.png'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.type).toBe('image');
      expect(result.path).toBe('test.png');
      expect(result.content).toBeTruthy();
      expect(result.mimeType).toBe('image/png');
      expect(mockVault.readBinary).toHaveBeenCalledWith(mockTFile);
    });

    it('should preserve existing image content', async () => {
      const existingContent = 'base64encodedcontent';
      const inputFile: LLMFile = {
        type: 'image',
        path: 'test.jpg',
        content: existingContent,
        mimeType: 'image/jpeg'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result).toEqual({
        type: 'image',
        path: 'test.jpg',
        content: existingContent,
        mimeType: 'image/jpeg',
        name: 'test.jpg'
      });
      expect(mockVault.getAbstractFileByPath).not.toHaveBeenCalled();
    });

    it('should infer MIME type from file extension', async () => {
      const testCases = [
        { path: 'test.png', expectedMime: 'image/png' },
        { path: 'test.jpg', expectedMime: 'image/jpeg' },
        { path: 'test.jpeg', expectedMime: 'image/jpeg' },
        { path: 'test.gif', expectedMime: 'image/gif' },
        { path: 'test.webp', expectedMime: 'image/webp' },
        { path: 'test.svg', expectedMime: 'image/svg+xml' },
        { path: 'test.unknown', expectedMime: 'image/png' } // default
      ];

      for (const testCase of testCases) {
        const mockTFile = new TFile();
        const mockArrayBuffer = new ArrayBuffer(1);
        
        mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
        mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

        const inputFile: LLMFile = {
          type: 'image',
          path: testCase.path
        };

        const result = await processor.processLLMFile(inputFile);

        expect(result.mimeType).toBe(testCase.expectedMime);
      }
    });

    it('should preserve existing MIME type', async () => {
      const mockTFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(1);
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'test.png',
        mimeType: 'custom/type'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.mimeType).toBe('custom/type');
    });

    it('should throw error when image file not found', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'nonexistent.png'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Failed to read image nonexistent.png: Image not found: nonexistent.png');
    });

    it('should handle binary read errors', async () => {
      const mockTFile = new TFile();
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockRejectedValue(new Error('File corrupted'));

      const inputFile: LLMFile = {
        type: 'image',
        path: 'test.png'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Failed to read image test.png: File corrupted');
    });
  });

  describe('processLLMFile - PDF files', () => {
    it('should read and encode PDF file', async () => {
      const mockTFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(4);
      const view = new Uint8Array(mockArrayBuffer);
      view[0] = 37;  // %
      view[1] = 80;  // P
      view[2] = 68;  // D
      view[3] = 70;  // F

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFile: LLMFile = {
        type: 'pdf',
        path: 'document.pdf'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.type).toBe('pdf');
      expect(result.path).toBe('document.pdf');
      expect(result.content).toBeTruthy();
      expect(result.mimeType).toBe('application/pdf');
      expect(mockVault.readBinary).toHaveBeenCalledWith(mockTFile);
      expect(global.btoa).toHaveBeenCalled();
    });

    it('should preserve existing PDF content', async () => {
      const existingContent = 'pdfbase64content';
      const inputFile: LLMFile = {
        type: 'pdf',
        path: 'document.pdf',
        content: existingContent
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.content).toBe(existingContent);
      expect(mockVault.getAbstractFileByPath).not.toHaveBeenCalled();
    });
  });

  describe('processAllFiles', () => {
    it('should process multiple files of different types', async () => {
      const mockTextFile = new TFile();
      const mockImageFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(1);

      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(mockTextFile)
        .mockReturnValueOnce(mockImageFile);
      
      mockVault.read.mockResolvedValue('Text content');
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFiles: LLMFile[] = [
        { type: 'text', path: 'note.md' },
        { type: 'image', path: 'image.png' },
        { type: 'text', path: 'existing.md', content: 'Existing content' }
      ];

      const results = await processor.processAllFiles(inputFiles);

      expect(results).toHaveLength(3);
      expect(results[0].content).toBe('Text content');
      expect(results[1].content).toBeTruthy();
      expect(results[1].mimeType).toBe('image/png');
      expect(results[2].content).toBe('Existing content');
    });

    it('should handle empty file array', async () => {
      const results = await processor.processAllFiles([]);
      expect(results).toEqual([]);
    });

    it('should handle mix of successful and failed file processing', async () => {
      const mockTextFile = new TFile();
      
      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(mockTextFile)
        .mockReturnValueOnce(null); // File not found

      mockVault.read.mockResolvedValue('Success content');

      const inputFiles: LLMFile[] = [
        { type: 'text', path: 'success.md' },
        { type: 'text', path: 'notfound.md' }
      ];

      // The second file should throw an error
      await expect(processor.processAllFiles(inputFiles))
        .rejects.toThrow('Failed to read note notfound.md');
    });

    it('should process files concurrently', async () => {
      const mockFiles = Array(3).fill(null).map(() => new TFile());
      
      mockVault.getAbstractFileByPath
        .mockReturnValueOnce(mockFiles[0])
        .mockReturnValueOnce(mockFiles[1])
        .mockReturnValueOnce(mockFiles[2]);

      // Add delays to test concurrency
      mockVault.read
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('Content 1'), 100)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('Content 2'), 50)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('Content 3'), 75)));

      const inputFiles: LLMFile[] = [
        { type: 'text', path: 'file1.md' },
        { type: 'text', path: 'file2.md' },
        { type: 'text', path: 'file3.md' }
      ];

      const startTime = Date.now();
      const results = await processor.processAllFiles(inputFiles);
      const endTime = Date.now();

      expect(results).toHaveLength(3);
      expect(results[0].content).toBe('Content 1');
      expect(results[1].content).toBe('Content 2');
      expect(results[2].content).toBe('Content 3');

      // Should take roughly 100ms (longest delay) rather than 225ms (sum of delays)
      // Adding some tolerance for test environment
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle files with no extension', async () => {
      const mockTFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(1);
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'imagefile' // no extension
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.mimeType).toBe('image/png'); // default
    });

    it('should handle files with uppercase extensions', async () => {
      const mockTFile = new TFile();
      const mockArrayBuffer = new ArrayBuffer(1);
      
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(mockArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'test.JPG'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should handle large binary files', async () => {
      const mockTFile = new TFile();
      const largeArrayBuffer = new ArrayBuffer(1024 * 1024); // 1MB
      const view = new Uint8Array(largeArrayBuffer);
      // Fill with some data
      for (let i = 0; i < view.length; i++) {
        view[i] = i % 256;
      }

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(largeArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'large.png'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.content).toBeTruthy();
      expect(result.content!.length).toBeGreaterThan(1000000); // base64 encoded should be larger
    });

    it('should handle empty files', async () => {
      const mockTFile = new TFile();
      const emptyArrayBuffer = new ArrayBuffer(0);

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.readBinary.mockResolvedValue(emptyArrayBuffer);

      const inputFile: LLMFile = {
        type: 'image',
        path: 'empty.png'
      };

      const result = await processor.processLLMFile(inputFile);

      expect(result.content).toBe('');
    });

    it('should handle null vault responses gracefully', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const inputFile: LLMFile = {
        type: 'text',
        path: 'test.md'
      };

      await expect(processor.processLLMFile(inputFile))
        .rejects.toThrow('Note not found: test.md');
    });
  });
});