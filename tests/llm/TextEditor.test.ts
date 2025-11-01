import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TextEditorTool, TextEditorCommand } from '../../src/llm/tools/TextEditor';

// Mock Obsidian classes
jest.mock('obsidian', () => ({
  TFile: function MockTFile(path: string, name: string, extension: string = 'md') {
    this.path = path;
    this.name = name;
    this.extension = extension;
    this.stat = { ctime: Date.now(), mtime: Date.now(), size: 100 };
  },
  TFolder: function MockTFolder(path: string, name: string, children: any[] = []) {
    this.path = path;
    this.name = name;
    this.children = children;
  }
}));

const { TFile: MockTFile, TFolder: MockTFolder } = require('obsidian');

describe('TextEditorTool', () => {
  let textEditorTool: TextEditorTool;
  let mockApp: any;

  beforeEach(() => {
    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn(),
        read: jest.fn(),
        modify: jest.fn(),
        create: jest.fn(),
        getFiles: jest.fn(),
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          stat: jest.fn(),
          read: jest.fn(),
          write: jest.fn(),
          remove: jest.fn(),
          mkdir: jest.fn(),
          list: jest.fn().mockResolvedValue({ files: [], folders: [] })
        }
      }
    };

    textEditorTool = new TextEditorTool(mockApp);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCommand', () => {
    it('should handle unknown commands', async () => {
      const command = { command: 'unknown', path: 'test.md' } as any;

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command: unknown');
    });

    it('should handle execution errors', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'test.md' };
      mockApp.vault.getAbstractFileByPath.mockImplementation(() => {
        throw new Error('Vault error');
      });

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to view test.md: Vault error');
    });
  });

  describe('viewFile command', () => {
    it('should view entire file content', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'test.md' };
      const fileContent = 'Line 1\nLine 2\nLine 3';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe(fileContent);
    });

    it('should view file with line range', async () => {
      const command = { command: 'view', path: 'test.md', view_range: [2, 3] } as TextEditorCommand;
      const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Line 2\nLine 3');
    });

    it('should list directory contents', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'folder' };
      const mockFolder = new MockTFolder('folder', 'folder', [
        new MockTFile('folder/file1.md', 'file1.md'),
        new MockTFolder('folder/subfolder', 'subfolder')
      ]);

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(mockFolder);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Directory: folder');
      expect(result.content).toContain('file: file1.md');
      expect(result.content).toContain('directory: subfolder');
    });

    it('should handle file not found', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'nonexistent.md' };
      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path not found: nonexistent.md');
    });

    it('should handle read errors', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'test.md' };
      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockRejectedValue(new Error('Read error'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to view test.md: Read error');
    });
  });

  describe('str_replace command', () => {
    it('should replace text successfully', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old text',
        new_str: 'new text'
      };
      const fileContent = 'This is old text in the file';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Successfully replaced text in test.md');
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'This is new text in the file'
      );
    });

    it('should handle no match found', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'nonexistent text',
        new_str: 'new text'
      };
      const fileContent = 'This file has different content';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No match found for replacement text');
    });

    it('should handle multiple matches', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'duplicate',
        new_str: 'unique'
      };
      const fileContent = 'This has duplicate text and duplicate again';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Found 2 matches for replacement text');
    });

    it('should handle file not found', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'nonexistent.md',
        old_str: 'old',
        new_str: 'new'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found: nonexistent.md');
    });

    it('should handle modify errors', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old',
        new_str: 'new'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue('old text');
      mockApp.vault.modify.mockRejectedValue(new Error('Modify error'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to replace text in test.md: Modify error');
    });
  });

  describe('create command', () => {
    it('should create file with content', async () => {
      const command: TextEditorCommand = {
        command: 'create',
        path: 'new-file.md',
        file_text: 'New file content'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);
      mockApp.vault.create.mockResolvedValue(new MockTFile('new-file.md', 'new-file.md'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Successfully created file: new-file.md');
      expect(mockApp.vault.create).toHaveBeenCalledWith('new-file.md', 'New file content');
    });

    it('should create empty file when no content provided', async () => {
      const command: TextEditorCommand = {
        command: 'create',
        path: 'empty-file.md'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);
      mockApp.vault.create.mockResolvedValue(new MockTFile('empty-file.md', 'empty-file.md'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.create).toHaveBeenCalledWith('empty-file.md', '');
    });

    it('should handle file already exists', async () => {
      const command: TextEditorCommand = {
        command: 'create',
        path: 'existing-file.md',
        file_text: 'Content'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('existing-file.md', 'existing-file.md'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File already exists: existing-file.md');
    });

    it('should handle create errors', async () => {
      const command: TextEditorCommand = {
        command: 'create',
        path: 'new-file.md',
        file_text: 'Content'
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);
      mockApp.vault.create.mockRejectedValue(new Error('Create error'));

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create file new-file.md: Create error');
    });
  });

  describe('insert command', () => {
    it('should insert text after specified line', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'Inserted line',
        insert_line: 1
      };
      const fileContent = 'Line 1\nLine 2';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Successfully inserted text at line 1 in test.md');
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'Line 1\nInserted line\nLine 2'
      );
    });

    it('should insert at beginning of file', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'First line',
        insert_line: 0
      };
      const fileContent = 'Original first line';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'First line\nOriginal first line'
      );
    });

    it('should insert at end of file', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'Last line',
        insert_line: 2
      };
      const fileContent = 'Line 1\nLine 2';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'Line 1\nLine 2\nLast line'
      );
    });

    it('should handle invalid line numbers', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'Text',
        insert_line: 10
      };
      const fileContent = 'Line 1\nLine 2';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid line number 10');
      expect(result.error).toContain('File has 2 lines');
    });

    it('should handle negative line numbers', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'Text',
        insert_line: -1
      };
      const fileContent = 'Line 1';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid line number -1');
    });

    it('should handle file not found', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'nonexistent.md',
        insert_text: 'Text',
        insert_line: 1
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(null);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found: nonexistent.md');
    });

    it('should handle insert_text with trailing newline', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'INSERTED LINE\n',
        insert_line: 1
      };
      const fileContent = 'Line 1\nLine 2\nLine 3';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'Line 1\nINSERTED LINE\n\nLine 2\nLine 3'
      );
    });

    it('should handle insert_text with multiple lines', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'Line A\nLine B\nLine C',
        insert_line: 1
      };
      const fileContent = 'Line 1\nLine 3';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(fileContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'Line 1\nLine A\nLine B\nLine C\nLine 3'
      );
    });
  });

  describe('edit history', () => {
    it('should save to history before modifications', async () => {
      const command: TextEditorCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old',
        new_str: 'new'
      };
      const originalContent = 'old content';

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue(originalContent);
      mockApp.vault.modify.mockResolvedValue(undefined);

      await textEditorTool.executeCommand(command);

      // Test undo functionality
      const undoResult = await textEditorTool.undoLastEdit('test.md');

      expect(undoResult.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenLastCalledWith(
        expect.any(MockTFile),
        originalContent
      );
    });

    it('should handle undo with no history', async () => {
      const result = await textEditorTool.undoLastEdit('nonexistent.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No edit history found for nonexistent.md');
    });

    it('should limit history to 10 entries', async () => {
      const file = new MockTFile('test.md', 'test.md');
      mockApp.vault.getAbstractFileByPath.mockResolvedValue(file);
      mockApp.vault.modify.mockResolvedValue(undefined);

      // Make 15 edits
      for (let i = 0; i < 15; i++) {
        mockApp.vault.read.mockResolvedValue(`content ${i}`);

        const command: TextEditorCommand = {
          command: 'str_replace',
          path: 'test.md',
          old_str: `content ${i}`,
          new_str: `content ${i + 1}`
        };

        await textEditorTool.executeCommand(command);
      }

      // History should be limited, so we can only undo 10 times max
      let undoCount = 0;
      let undoResult;

      do {
        undoResult = await textEditorTool.undoLastEdit('test.md');
        if (undoResult.success) undoCount++;
      } while (undoResult.success && undoCount < 15);

      expect(undoCount).toBeLessThanOrEqual(10);
    });
  });

  describe('helper methods', () => {
    it('should get file stats', async () => {
      const file = new MockTFile('test.md', 'test.md');
      mockApp.vault.getAbstractFileByPath.mockResolvedValue(file);
      mockApp.vault.read.mockResolvedValue('File content\nSecond line');

      const result = await textEditorTool.getFileStats('test.md');

      expect(result.success).toBe(true);
      const stats = JSON.parse(result.content!);
      expect(stats.name).toBe('test.md');
      expect(stats.path).toBe('test.md');
      expect(stats.lines).toBe(2);
      expect(stats.extension).toBe('md');
    });

    it('should list all files', async () => {
      const files = [
        new MockTFile('file1.md', 'file1.md'),
        new MockTFile('file2.txt', 'file2.txt', 'txt')
      ];
      mockApp.vault.getFiles.mockReturnValue(files);

      const result = await textEditorTool.listAllFiles();

      expect(result.success).toBe(true);
      const fileList = JSON.parse(result.content!);
      expect(fileList).toHaveLength(2);
      expect(fileList[0].name).toBe('file1.md');
      expect(fileList[1].extension).toBe('txt');
    });
  });

  describe('path normalization', () => {
    it('should handle paths with leading slashes', async () => {
      const command: TextEditorCommand = { command: 'view', path: '/test.md' };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue('content');

      await textEditorTool.executeCommand(command);

      // Should normalize path by removing leading slashes
      expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('test.md');
    });

    it('should handle multiple leading slashes', async () => {
      const command: TextEditorCommand = { command: 'view', path: '///test.md' };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('test.md', 'test.md'));
      mockApp.vault.read.mockResolvedValue('content');

      await textEditorTool.executeCommand(command);

      expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('test.md');
    });
  });

  describe('edge cases', () => {
    it('should handle empty files', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'empty.md' };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('empty.md', 'empty.md'));
      mockApp.vault.read.mockResolvedValue('');

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle files with only newlines', async () => {
      const command: TextEditorCommand = {
        command: 'insert',
        path: 'newlines.md',
        insert_text: 'content',
        insert_line: 0
      };

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('newlines.md', 'newlines.md'));
      mockApp.vault.read.mockResolvedValue('\n\n\n');
      mockApp.vault.modify.mockResolvedValue(undefined);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        expect.any(MockTFile),
        'content\n\n\n\n'
      );
    });

    it('should handle very large files', async () => {
      const command: TextEditorCommand = { command: 'view', path: 'large.md' };
      const largeContent = 'line\n'.repeat(10000);

      mockApp.vault.getAbstractFileByPath.mockResolvedValue(new MockTFile('large.md', 'large.md'));
      mockApp.vault.read.mockResolvedValue(largeContent);

      const result = await textEditorTool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe(largeContent);
    });
  });
});