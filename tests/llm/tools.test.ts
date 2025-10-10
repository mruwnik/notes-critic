import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the obsidian module before importing our code
jest.mock('obsidian', () => {
  class MockTAbstractFile {
    name: string = '';
    path: string = '';
  }

  class MockTFile extends MockTAbstractFile {
    basename: string = '';
    extension: string = '';
    stat: any = {};
  }

  class MockTFolder extends MockTAbstractFile {
    children: any[] = [];
  }

  return {
    TFile: MockTFile,
    TFolder: MockTFolder,
    TAbstractFile: MockTAbstractFile
  };
});

import {
  TextEditorTool,
  TextEditorCommand,
  ViewCommand,
  StrReplaceCommand,
  CreateCommand,
  InsertCommand,
  textEditorToolDefinition
} from '../../src/llm/tools';
import { TFile, TFolder, TAbstractFile } from 'obsidian';

describe('TextEditorTool', () => {
  let tool: TextEditorTool;
  let mockApp: any;
  let mockVault: any;
  let mockTFile: any;
  let mockTFolder: any;

  beforeEach(() => {
    // Create mock instances that pass instanceof checks
    mockTFile = new TFile();
    mockTFile.basename = 'test';
    mockTFile.name = 'test.md';
    mockTFile.path = 'test.md';
    mockTFile.extension = 'md';
    mockTFile.stat = { ctime: Date.now(), mtime: Date.now(), size: 100 };

    mockTFolder = new TFolder();
    mockTFolder.name = 'folder';
    mockTFolder.path = 'folder';
    mockTFolder.children = [];
    mockVault = {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
      modify: jest.fn(),
      create: jest.fn(),
      createFolder: jest.fn(),
      adapter: {
        path: {
          dirname: jest.fn((path: string) => path.split('/').slice(0, -1).join('/') || ''),
          exists: jest.fn()
        }
      }
    };

    mockApp = {
      vault: mockVault
    };

    tool = new TextEditorTool(mockApp);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with app instance', () => {
      expect(tool['app']).toBe(mockApp);
      expect(tool['editHistory']).toBeInstanceOf(Map);
    });
  });

  describe('executeCommand', () => {
    it('should route to correct command handler', async () => {
      const viewCommand: ViewCommand = { command: 'view', path: 'test.md' };

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue('file content');

      const result = await tool.executeCommand(viewCommand);

      expect(result.success).toBe(true);
      expect(result.content).toBe('file content');
    });

    it('should handle unknown commands gracefully', async () => {
      const invalidCommand = { command: 'unknown' } as any;

      const result = await tool.executeCommand(invalidCommand);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command');
    });

    it('should handle command execution errors', async () => {
      const viewCommand: ViewCommand = { command: 'view', path: 'nonexistent.md' };

      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const result = await tool.executeCommand(viewCommand);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path not found');
    });
  });

  describe('view command', () => {

    it('should read entire file content', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(content);

      const command: ViewCommand = { command: 'view', path: 'test.md' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe(content);
      expect(mockVault.read).toHaveBeenCalledWith(mockTFile);
    });

    it('should read specific line range', async () => {
      const content = 'line1\nline2\nline3\nline4\nline5';
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(content);

      const command: ViewCommand = {
        command: 'view',
        path: 'test.md',
        view_range: [2, 4]
      };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe('line2\nline3\nline4');
    });

    it('should handle invalid line ranges', async () => {
      const content = 'line1\nline2\nline3';
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(content);

      const command: ViewCommand = {
        command: 'view',
        path: 'test.md',
        view_range: [5, 10]
      };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle empty files', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue('');

      const command: ViewCommand = { command: 'view', path: 'empty.md' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toBe('');
    });

    it('should handle file read errors', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockRejectedValue(new Error('Permission denied'));

      const command: ViewCommand = { command: 'view', path: 'test.md' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should handle non-existent files', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const command: ViewCommand = { command: 'view', path: 'nonexistent.md' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path not found');
    });

    it('should handle folder instead of file', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFolder);

      const command: ViewCommand = { command: 'view', path: 'folder' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Directory: folder');
    });
  });

  describe('str_replace command', () => {

    it('should replace text successfully', async () => {
      const originalContent = 'line1\nold text\nline3';
      const expectedContent = 'line1\nnew text\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old text',
        new_str: 'new text'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should handle multiple occurrences of text with error', async () => {
      const originalContent = 'hello world\nhello everyone\nhello world';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'hello',
        new_str: 'hi'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Found 3 matches for replacement text');
    });

    it('should handle text not found', async () => {
      const originalContent = 'line1\nline2\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'nonexistent',
        new_str: 'replacement'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No match found for replacement text');
    });

    it('should handle multiline replacements', async () => {
      const originalContent = 'line1\nold line 2\nold line 3\nline4';
      const expectedContent = 'line1\nnew line 2\nnew line 3\nline4';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old line 2\nold line 3',
        new_str: 'new line 2\nnew line 3'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should handle empty replacement', async () => {
      const originalContent = 'line1\nto remove\nline3';
      const expectedContent = 'line1\n\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'to remove',
        new_str: ''
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should handle modification errors', async () => {
      const originalContent = 'line1\nold text\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockRejectedValue(new Error('File is readonly'));

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'old text',
        new_str: 'new text'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File is readonly');
    });

    it('should store edit history', async () => {
      const originalContent = 'original content';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'test.md',
        old_str: 'original',
        new_str: 'modified'
      };

      await tool.executeCommand(command);

      const history = tool['editHistory'].get('test.md');
      expect(history).toContain(originalContent);
    });
  });

  describe('create command', () => {
    it('should create new file with content', async () => {
      const content = 'new file content';
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      mockVault.create.mockResolvedValue(mockTFile);

      const command: CreateCommand = {
        command: 'create',
        path: 'new-file.md',
        file_text: content
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.create).toHaveBeenCalledWith('new-file.md', content);
    });

    it('should create empty file when no content provided', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      mockVault.create.mockResolvedValue(mockTFile);

      const command: CreateCommand = {
        command: 'create',
        path: 'empty-file.md'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.create).toHaveBeenCalledWith('empty-file.md', '');
    });

    it('should handle file already exists', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);

      const command: CreateCommand = {
        command: 'create',
        path: 'existing.md',
        file_text: 'content'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File already exists');
    });

    it('should handle nested paths (Obsidian handles directory creation)', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      mockVault.create.mockResolvedValue(mockTFile);

      const command: CreateCommand = {
        command: 'create',
        path: 'deep/nested/folder/file.md',
        file_text: 'content'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.create).toHaveBeenCalledWith('deep/nested/folder/file.md', 'content');
    });

    it('should handle create errors', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      mockVault.create.mockRejectedValue(new Error('Permission denied'));

      const command: CreateCommand = {
        command: 'create',
        path: 'new-file.md',
        file_text: 'content'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('insert command', () => {

    it('should insert text at specified line', async () => {
      const originalContent = 'line1\nline2\nline3';
      const expectedContent = 'line1\ninserted line\nline2\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'inserted line',
        insert_line: 1 // 0-indexed: insert at position 1 (between line1 and line2)
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should insert at beginning of file', async () => {
      const originalContent = 'line1\nline2';
      const expectedContent = 'inserted line\nline1\nline2';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'inserted line',
        insert_line: 0 // 0-indexed: insert at beginning
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should insert at end of file', async () => {
      const originalContent = 'line1\nline2';
      const expectedContent = 'line1\nline2\ninserted line';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'inserted line',
        insert_line: 2 // 0-indexed: insert after 2 lines (at end)
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should handle invalid line numbers', async () => {
      const originalContent = 'line1\nline2';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'inserted line',
        insert_line: 10
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid line number 10. File has 2 lines.');
    });

    it('should insert multiple lines', async () => {
      const originalContent = 'line1\nline2';
      const expectedContent = 'line1\ninserted line 1\ninserted line 2\nline2';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'inserted line 1\ninserted line 2',
        insert_line: 1 // 0-indexed: insert at position 1 (between line1 and line2)
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });

    it('should handle empty file insertion', async () => {
      const originalContent = '';
      const expectedContent = 'first line\n';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(originalContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: InsertCommand = {
        command: 'insert',
        path: 'test.md',
        insert_text: 'first line',
        insert_line: 0 // 0-indexed: insert at beginning of empty file
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, expectedContent);
    });
  });

  describe('textEditorToolDefinition', () => {
    it('should have correct tool definition structure', () => {
      expect(textEditorToolDefinition).toHaveProperty('name');
      expect(textEditorToolDefinition).toHaveProperty('description');
      expect(textEditorToolDefinition).toHaveProperty('parameters');

      expect(textEditorToolDefinition.name).toBe('str_replace_based_edit_tool');
      expect(textEditorToolDefinition.parameters).toHaveProperty('type', 'object');
      expect(textEditorToolDefinition.parameters).toHaveProperty('properties');
      expect(textEditorToolDefinition.parameters).toHaveProperty('required');
    });

    it('should define all command types in schema', () => {
      const properties = textEditorToolDefinition.parameters.properties;

      expect(properties).toHaveProperty('command');
      expect(properties.command).toHaveProperty('enum');
      expect(properties.command.enum).toContain('view');
      expect(properties.command.enum).toContain('str_replace');
      expect(properties.command.enum).toContain('create');
      expect(properties.command.enum).toContain('insert');
    });

    it('should have required fields defined', () => {
      const required = textEditorToolDefinition.parameters.required;

      expect(required).toContain('command');
      expect(required).toContain('path');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle very large files', async () => {
      const largeContent = 'x'.repeat(1000000); // 1MB of text

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(largeContent);

      const command: ViewCommand = { command: 'view', path: 'large.md' };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.content?.length).toBe(1000000);
    });

    it('should handle special characters in file paths', async () => {
      const specialPath = 'folder with spaces/file-with-dashes_and_underscores.md';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue('content');

      const command: ViewCommand = { command: 'view', path: specialPath };
      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(specialPath);
    });

    it('should handle unicode content', async () => {
      const unicodeContent = '中文测试\n🚀 emoji test\n«special» characters';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(unicodeContent);
      mockVault.modify.mockResolvedValue(undefined);

      const command: StrReplaceCommand = {
        command: 'str_replace',
        path: 'unicode.md',
        old_str: '中文测试',
        new_str: 'Chinese test'
      };

      const result = await tool.executeCommand(command);

      expect(result.success).toBe(true);
      expect(mockVault.modify).toHaveBeenCalledWith(
        mockTFile,
        'Chinese test\n🚀 emoji test\n«special» characters'
      );
    });

    it('should maintain edit history across multiple operations', async () => {
      const originalContent = 'original';
      const step1Content = 'step1';
      const step2Content = 'step2';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      // Each str_replace reads the file twice: once for history, once in fileOps.replaceText
      mockVault.read
        .mockResolvedValueOnce(originalContent)  // First edit: history save
        .mockResolvedValueOnce(originalContent)  // First edit: fileOps.replaceText
        .mockResolvedValueOnce(step1Content)     // Second edit: history save
        .mockResolvedValueOnce(step1Content);    // Second edit: fileOps.replaceText
      mockVault.modify.mockResolvedValue(undefined);

      // First edit
      await tool.executeCommand({
        command: 'str_replace',
        path: 'test.md',
        old_str: 'original',
        new_str: 'step1'
      });

      // Second edit
      await tool.executeCommand({
        command: 'str_replace',
        path: 'test.md',
        old_str: 'step1',
        new_str: 'step2'
      });

      const history = tool['editHistory'].get('test.md');
      expect(history).toContain(originalContent);
      expect(history).toContain(step1Content);
      expect(history).toHaveLength(2);
    });

    it('should handle concurrent operations gracefully', async () => {
      const content = 'line1\nline2\nline3';

      mockVault.getAbstractFileByPath.mockReturnValue(mockTFile);
      mockVault.read.mockResolvedValue(content);
      mockVault.modify.mockResolvedValue(undefined);

      // Start multiple operations concurrently
      const operations = [
        tool.executeCommand({
          command: 'str_replace',
          path: 'test.md',
          old_str: 'line1',
          new_str: 'modified1'
        }),
        tool.executeCommand({
          command: 'view',
          path: 'test.md'
        }),
        tool.executeCommand({
          command: 'str_replace',
          path: 'test.md',
          old_str: 'line2',
          new_str: 'modified2'
        })
      ];

      const results = await Promise.all(operations);

      // All operations should complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});