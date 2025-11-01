import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryTool, MemoryCommand } from '../../src/llm/tools/Memory';

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

describe('MemoryTool', () => {
    let memoryTool: MemoryTool;
    let mockApp: any;

    beforeEach(() => {
        mockApp = {
            vault: {
                getAbstractFileByPath: jest.fn(),
                read: jest.fn(),
                modify: jest.fn(),
                create: jest.fn(),
                createFolder: jest.fn(),
                delete: jest.fn(),
                adapter: {
                    exists: jest.fn().mockResolvedValue(false),
                    stat: jest.fn(),
                    read: jest.fn(),
                    write: jest.fn(),
                    remove: jest.fn(),
                    mkdir: jest.fn(),
                    list: jest.fn().mockResolvedValue({ files: [], folders: [] })
                }
            },
            fileManager: {
                renameFile: jest.fn()
            }
        };

        memoryTool = new MemoryTool(mockApp);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('executeCommand', () => {
        it('should handle unknown commands', async () => {
            const command = { command: 'unknown', path: 'memories/test.md' } as any;

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown command: unknown');
        });

        it('should handle execution errors', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockRejectedValue(new Error('Vault error'));

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to view memories/test.md: Vault error');
        });
    });

    describe('path validation', () => {
        it('should reject paths outside /memories directory', async () => {
            const command: MemoryCommand = { command: 'view', path: '/other/file.md' };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path must be within /memories directory');
        });

        it('should reject path traversal attempts with ..', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/../secrets.md' };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path traversal not allowed');
        });

        it('should accept paths within /memories', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue('content');

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
        });

        it('should accept paths without leading slash', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue('content');

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
        });

        it('should accept root memories directory', async () => {
            const command: MemoryCommand = { command: 'view', path: '/memories' };
            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFolder('memories', 'memories', []));

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Directory: memories');
        });
    });

    describe('view command', () => {
        it('should view entire file content', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            const fileContent = 'Line 1\nLine 2\nLine 3';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe(fileContent);
        });

        it('should view file with line range', async () => {
            const command = { command: 'view', path: 'memories/test.md', view_range: [2, 3] } as MemoryCommand;
            const fileContent = 'Line 1\nLine 2\nLine 3\nLine 4';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe('Line 2\nLine 3');
        });

        it('should list directory contents', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/subfolder' };
            const mockFolder = new MockTFolder('memories/subfolder', 'subfolder', [
                new MockTFile('memories/subfolder/file1.md', 'file1.md'),
                new MockTFolder('memories/subfolder/nested', 'nested')
            ]);

            mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Directory: memories/subfolder');
            expect(result.content).toContain('file: file1.md');
            expect(result.content).toContain('directory: nested');
        });

        it('should show empty for empty directory', async () => {
            const command: MemoryCommand = { command: 'view', path: '/memories' };
            const mockFolder = new MockTFolder('memories', 'memories', []);

            mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFolder);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('(empty)');
        });

        it('should handle file not found', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/nonexistent.md' };
            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found: memories/nonexistent.md');
        });
    });

    describe('create command', () => {
        it('should create file with content', async () => {
            const command: MemoryCommand = {
                command: 'create',
                path: 'memories/new-file.md',
                file_text: 'New file content'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
            mockApp.vault.create.mockResolvedValue(new MockTFile('memories/new-file.md', 'new-file.md'));

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully created file: memories/new-file.md');
            expect(mockApp.vault.create).toHaveBeenCalledWith('memories/new-file.md', 'New file content');
        });

        it('should create empty file when no content provided', async () => {
            const command: MemoryCommand = {
                command: 'create',
                path: 'memories/empty-file.md'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
            mockApp.vault.create.mockResolvedValue(new MockTFile('memories/empty-file.md', 'empty-file.md'));

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(mockApp.vault.create).toHaveBeenCalledWith('memories/empty-file.md', '');
        });

        it('should overwrite existing file', async () => {
            const command: MemoryCommand = {
                command: 'create',
                path: 'memories/existing-file.md',
                file_text: 'New content'
            };

            const existingFile = new MockTFile('memories/existing-file.md', 'existing-file.md');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(existingFile);
            mockApp.vault.modify.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully overwrote file');
            expect(mockApp.vault.modify).toHaveBeenCalledWith(existingFile, 'New content');
        });

        it('should create parent directories automatically', async () => {
            const command: MemoryCommand = {
                command: 'create',
                path: 'memories/deep/nested/path/file.md',
                file_text: 'Content'
            };

            // Mock the file path checks returning null (doesn't exist)
            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            mockApp.vault.createFolder.mockResolvedValue(undefined);
            mockApp.vault.create.mockResolvedValue(new MockTFile('memories/deep/nested/path/file.md', 'file.md'));

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(mockApp.vault.adapter.mkdir).toHaveBeenCalledWith('memories/deep');
            expect(mockApp.vault.adapter.mkdir).toHaveBeenCalledWith('memories/deep/nested');
            expect(mockApp.vault.adapter.mkdir).toHaveBeenCalledWith('memories/deep/nested/path');
            expect(mockApp.vault.create).toHaveBeenCalledWith('memories/deep/nested/path/file.md', 'Content');
        });

        it('should reject creating file outside memories', async () => {
            const command: MemoryCommand = {
                command: 'create',
                path: '/other/file.md',
                file_text: 'Content'
            };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path must be within /memories directory');
        });
    });

    describe('str_replace command', () => {
        it('should replace text successfully', async () => {
            const command: MemoryCommand = {
                command: 'str_replace',
                path: 'memories/test.md',
                old_str: 'old text',
                new_str: 'new text'
            };
            const fileContent = 'This is old text in the file';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);
            mockApp.vault.modify.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully replaced text in memories/test.md');
            expect(mockApp.vault.modify).toHaveBeenCalledWith(
                expect.any(MockTFile),
                'This is new text in the file'
            );
        });

        it('should handle no match found', async () => {
            const command: MemoryCommand = {
                command: 'str_replace',
                path: 'memories/test.md',
                old_str: 'nonexistent text',
                new_str: 'new text'
            };
            const fileContent = 'This file has different content';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('No match found for replacement text');
        });

        it('should handle multiple matches', async () => {
            const command: MemoryCommand = {
                command: 'str_replace',
                path: 'memories/test.md',
                old_str: 'duplicate',
                new_str: 'unique'
            };
            const fileContent = 'This has duplicate text and duplicate again';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Found 2 matches for replacement text');
        });

        it('should handle file not found', async () => {
            const command: MemoryCommand = {
                command: 'str_replace',
                path: 'memories/nonexistent.md',
                old_str: 'old',
                new_str: 'new'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File not found: memories/nonexistent.md');
        });
    });

    describe('insert command', () => {
        it('should insert text at specified line', async () => {
            const command: MemoryCommand = {
                command: 'insert',
                path: 'memories/test.md',
                insert_text: 'Inserted line',
                insert_line: 2
            };
            const fileContent = 'Line 1\nLine 2\nLine 3';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);
            mockApp.vault.modify.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully inserted text at line 2 in memories/test.md');
            expect(mockApp.vault.modify).toHaveBeenCalledWith(
                expect.any(MockTFile),
                'Line 1\nLine 2\nInserted line\nLine 3'
            );
        });

        it('should insert at beginning of file', async () => {
            const command: MemoryCommand = {
                command: 'insert',
                path: 'memories/test.md',
                insert_text: 'First line',
                insert_line: 0
            };
            const fileContent = 'Original first line';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);
            mockApp.vault.modify.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(mockApp.vault.modify).toHaveBeenCalledWith(
                expect.any(MockTFile),
                'First line\nOriginal first line'
            );
        });

        it('should handle invalid line numbers', async () => {
            const command: MemoryCommand = {
                command: 'insert',
                path: 'memories/test.md',
                insert_text: 'Text',
                insert_line: 10
            };
            const fileContent = 'Line 1\nLine 2';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(fileContent);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid line number 10');
            expect(result.error).toContain('File has 2 lines');
        });

        it('should handle file not found', async () => {
            const command: MemoryCommand = {
                command: 'insert',
                path: 'memories/nonexistent.md',
                insert_text: 'Text',
                insert_line: 1
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File not found: memories/nonexistent.md');
        });
    });

    describe('delete command', () => {
        it('should delete file successfully', async () => {
            const command: MemoryCommand = {
                command: 'delete',
                path: 'memories/old-file.md'
            };

            const file = new MockTFile('memories/old-file.md', 'old-file.md');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
            mockApp.vault.delete.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully deleted: memories/old-file.md');
            expect(mockApp.vault.delete).toHaveBeenCalledWith(file);
        });

        it('should delete directory successfully', async () => {
            const command: MemoryCommand = {
                command: 'delete',
                path: 'memories/old-folder'
            };

            const folder = new MockTFolder('memories/old-folder', 'old-folder');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(folder);
            mockApp.vault.delete.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully deleted: memories/old-folder');
            expect(mockApp.vault.delete).toHaveBeenCalledWith(folder);
        });

        it('should reject deleting root memories directory', async () => {
            const command: MemoryCommand = {
                command: 'delete',
                path: '/memories'
            };

            const folder = new MockTFolder('memories', 'memories');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(folder);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot delete the root memory directory');
            expect(mockApp.vault.delete).not.toHaveBeenCalled();
        });

        it('should handle file not found', async () => {
            const command: MemoryCommand = {
                command: 'delete',
                path: 'memories/nonexistent.md'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found: memories/nonexistent.md');
        });

        it('should reject deleting outside memories', async () => {
            const command: MemoryCommand = {
                command: 'delete',
                path: '/other/file.md'
            };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path must be within /memories directory');
        });
    });

    describe('rename command', () => {
        it('should rename file successfully', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: 'memories/old-name.md',
                new_path: 'memories/new-name.md'
            };

            const file = new MockTFile('memories/old-name.md', 'old-name.md');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(file);
            mockApp.fileManager.renameFile.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully renamed memories/old-name.md to memories/new-name.md');
            expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(file, 'memories/new-name.md');
        });

        it('should rename directory successfully', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: 'memories/old-folder',
                new_path: 'memories/new-folder'
            };

            const folder = new MockTFolder('memories/old-folder', 'old-folder');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(folder);
            mockApp.fileManager.renameFile.mockResolvedValue(undefined);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toContain('Successfully renamed memories/old-folder to memories/new-folder');
            expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(folder, 'memories/new-folder');
        });

        it('should reject renaming root memories directory', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: 'memories',
                new_path: 'memories/archive'
            };

            const folder = new MockTFolder('memories', 'memories');
            mockApp.vault.getAbstractFileByPath.mockReturnValue(folder);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot rename the root memory directory');
            expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
        });

        it('should reject moving file outside memories', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: 'memories/file.md',
                new_path: '/other/file.md'
            };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path must be within /memories directory');
        });

        it('should reject renaming from outside memories', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: '/other/file.md',
                new_path: 'memories/file.md'
            };

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path must be within /memories directory');
        });

        it('should handle file not found', async () => {
            const command: MemoryCommand = {
                command: 'rename',
                old_path: 'memories/nonexistent.md',
                new_path: 'memories/new-name.md'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found: memories/nonexistent.md');
        });
    });

    describe('edge cases', () => {
        it('should handle empty files', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/empty.md' };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/empty.md', 'empty.md'));
            mockApp.vault.read.mockResolvedValue('');

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe('');
        });

        it('should handle files with special characters', async () => {
            const command: MemoryCommand = { command: 'view', path: 'memories/file-with_special.chars.md' };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(
                new MockTFile('memories/file-with_special.chars.md', 'file-with_special.chars.md')
            );
            mockApp.vault.read.mockResolvedValue('content');

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe('content');
        });

        it('should handle deeply nested paths', async () => {
            const command: MemoryCommand = {
                command: 'view',
                path: 'memories/a/b/c/d/e/f/deep.md'
            };

            mockApp.vault.getAbstractFileByPath.mockReturnValue(
                new MockTFile('memories/a/b/c/d/e/f/deep.md', 'deep.md')
            );
            mockApp.vault.read.mockResolvedValue('deep content');

            const result = await memoryTool.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe('deep content');
        });
    });

    describe('maxCharacters option', () => {
        it('should truncate content when maxCharacters is set', async () => {
            const memoryToolWithLimit = new MemoryTool(mockApp, 'memories', 10);
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            const longContent = 'This is a very long content that should be truncated';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(longContent);

            const result = await memoryToolWithLimit.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe('This is a ');
            expect(result.content!.length).toBe(10);
        });

        it('should not truncate when content is within limit', async () => {
            const memoryToolWithLimit = new MemoryTool(mockApp, 'memories', 100);
            const command: MemoryCommand = { command: 'view', path: 'memories/test.md' };
            const shortContent = 'Short content';

            mockApp.vault.getAbstractFileByPath.mockReturnValue(new MockTFile('memories/test.md', 'test.md'));
            mockApp.vault.read.mockResolvedValue(shortContent);

            const result = await memoryToolWithLimit.executeCommand(command);

            expect(result.success).toBe(true);
            expect(result.content).toBe(shortContent);
        });
    });
});

