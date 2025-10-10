import { TFile, TFolder } from 'obsidian';
import {
    viewFile,
    replaceText,
    insertText,
    createFile,
    deleteFile,
    renameFile
} from '../../src/llm/tools/fileOperations';

// Mock Obsidian
jest.mock('obsidian', () => {
    class MockTFile {
        path: string;
        name: string;
        basename: string;
        extension: string;
        stat: any;
        constructor() {
            this.path = '';
            this.name = '';
            this.basename = '';
            this.extension = '';
            this.stat = { ctime: 0, mtime: 0, size: 0 };
        }
    }

    class MockTFolder {
        path: string;
        name: string;
        children: any[];
        constructor() {
            this.path = '';
            this.name = '';
            this.children = [];
        }
    }

    return {
        TFile: MockTFile,
        TFolder: MockTFolder,
        TAbstractFile: class MockTAbstractFile { }
    };
});

describe('fileOperations', () => {
    let mockApp: any;
    let mockVault: any;
    let mockAdapter: any;
    let mockFileManager: any;

    beforeEach(() => {
        mockAdapter = {
            exists: jest.fn(),
            stat: jest.fn(),
            list: jest.fn(),
            read: jest.fn(),
            write: jest.fn(),
            mkdir: jest.fn(),
            remove: jest.fn()
        };

        mockVault = {
            getAbstractFileByPath: jest.fn(),
            read: jest.fn(),
            modify: jest.fn(),
            create: jest.fn(),
            createFolder: jest.fn(),
            delete: jest.fn(),
            adapter: mockAdapter
        };

        mockFileManager = {
            renameFile: jest.fn()
        };

        mockApp = {
            vault: mockVault,
            fileManager: mockFileManager
        };
    });

    describe('viewFile', () => {
        it('should list folder contents for visible folders', async () => {
            const mockFolder = new TFolder();
            mockFolder.path = 'test-folder';
            mockFolder.name = 'test-folder';

            const mockFile = new TFile();
            mockFile.name = 'test.md';

            const mockSubFolder = new TFolder();
            mockSubFolder.name = 'subfolder';

            mockFolder.children = [mockFile, mockSubFolder];
            mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

            const result = await viewFile(mockApp, 'test-folder');

            expect(result.success).toBe(true);
            expect(result.content).toContain('Directory: test-folder');
            expect(result.content).toContain('file: test.md');
            expect(result.content).toContain('directory: subfolder');
        });

        it('should read file contents for visible files', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('File content');

            const result = await viewFile(mockApp, 'test.md');

            expect(result.success).toBe(true);
            expect(result.content).toBe('File content');
        });

        it('should support view range for files', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2\nLine 3\nLine 4');

            const result = await viewFile(mockApp, 'test.md', [2, 3]);

            expect(result.success).toBe(true);
            expect(result.content).toBe('Line 2\nLine 3');
        });

        it('should truncate content if maxCharacters is specified', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('This is a very long content');

            const result = await viewFile(mockApp, 'test.md', undefined, 10);

            expect(result.success).toBe(true);
            expect(result.content).toBe('This is a ');
        });

        it('should use adapter API for hidden folders', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockAdapter.exists.mockResolvedValue(true);
            mockAdapter.stat.mockResolvedValue({ type: 'folder' });
            mockAdapter.list.mockResolvedValue({
                folders: ['.hidden/subfolder'],
                files: ['.hidden/test.md']
            });

            const result = await viewFile(mockApp, '.hidden');

            expect(result.success).toBe(true);
            expect(result.content).toContain('Directory: .hidden');
            expect(result.content).toContain('directory: subfolder');
            expect(result.content).toContain('file: test.md');
        });

        it('should create hidden directory if it does not exist', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockAdapter.exists.mockResolvedValue(false);
            mockAdapter.stat.mockResolvedValue({ type: 'folder' });
            mockAdapter.list.mockResolvedValue({ folders: [], files: [] });

            const result = await viewFile(mockApp, '.hidden');

            expect(mockAdapter.mkdir).toHaveBeenCalledWith('.hidden');
            expect(result.success).toBe(true);
            expect(result.content).toContain('(empty)');
        });

        it('should read hidden file using adapter', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockAdapter.exists.mockResolvedValue(true);
            mockAdapter.stat.mockResolvedValue({ type: 'file' });
            mockAdapter.read.mockResolvedValue('Hidden file content');

            const result = await viewFile(mockApp, '.hidden/file.md');

            expect(result.success).toBe(true);
            expect(result.content).toBe('Hidden file content');
        });

        it('should return error for non-existent path', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockAdapter.exists.mockResolvedValue(true);
            mockAdapter.stat.mockResolvedValue(null);

            const result = await viewFile(mockApp, 'nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found');
        });
    });

    describe('replaceText', () => {
        it('should replace text in file', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Hello world');

            const result = await replaceText(mockApp, 'test.md', 'world', 'universe');

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'Hello universe');
        });

        it('should return error if no match found', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Hello world');

            const result = await replaceText(mockApp, 'test.md', 'xyz', 'abc');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No match found');
        });

        it('should return error if multiple matches found', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('test test test');

            const result = await replaceText(mockApp, 'test.md', 'test', 'TEST');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Found 3 matches');
        });

        it('should return error if file not found', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await replaceText(mockApp, 'missing.md', 'old', 'new');

            expect(result.success).toBe(false);
            expect(result.error).toContain('File not found');
        });
    });

    describe('insertText', () => {
        it('should insert text at beginning (line 0)', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2');

            const result = await insertText(mockApp, 'test.md', 'New line', 0);

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'New line\nLine 1\nLine 2');
        });

        it('should insert text at end', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2');

            const result = await insertText(mockApp, 'test.md', 'New line', 2);

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'Line 1\nLine 2\nNew line');
        });

        it('should insert text in middle', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2\nLine 3');

            const result = await insertText(mockApp, 'test.md', 'Middle line', 2);

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'Line 1\nLine 2\nMiddle line\nLine 3');
        });

        it('should handle multiline inserts', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2');

            const result = await insertText(mockApp, 'test.md', 'New 1\nNew 2', 1);

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'Line 1\nNew 1\nNew 2\nLine 2');
        });

        it('should return error for invalid line number', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.read.mockResolvedValue('Line 1\nLine 2');

            const result = await insertText(mockApp, 'test.md', 'New', 10);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid line number');
        });

        it('should return error if file not found', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await insertText(mockApp, 'missing.md', 'text', 0);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File not found');
        });
    });

    describe('createFile', () => {
        it('should create new file', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await createFile(mockApp, 'new.md', 'Content');

            expect(result.success).toBe(true);
            expect(mockVault.create).toHaveBeenCalledWith('new.md', 'Content');
        });

        it('should create parent directories if needed', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await createFile(mockApp, 'dir1/dir2/new.md', 'Content');

            expect(result.success).toBe(true);
            expect(mockVault.createFolder).toHaveBeenCalled();
            expect(mockVault.create).toHaveBeenCalledWith('dir1/dir2/new.md', 'Content');
        });

        it('should return error if file exists and overwrite is false', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            const result = await createFile(mockApp, 'existing.md', 'Content', false);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File already exists');
        });

        it('should overwrite file if overwrite is true', async () => {
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            const result = await createFile(mockApp, 'existing.md', 'New content', true);

            expect(result.success).toBe(true);
            expect(mockVault.modify).toHaveBeenCalledWith(mockFile, 'New content');
        });

        it('should create file with empty content by default', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await createFile(mockApp, 'empty.md');

            expect(result.success).toBe(true);
            expect(mockVault.create).toHaveBeenCalledWith('empty.md', '');
        });
    });

    describe('deleteFile', () => {
        it('should delete file', async () => {
            const mockFile = new TFile();
            mockFile.path = 'test.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            const result = await deleteFile(mockApp, 'test.md');

            expect(result.success).toBe(true);
            expect(mockVault.delete).toHaveBeenCalledWith(mockFile);
        });

        it('should delete folder', async () => {
            const mockFolder = new TFolder();
            mockFolder.path = 'test-folder';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

            const result = await deleteFile(mockApp, 'test-folder');

            expect(result.success).toBe(true);
            expect(mockVault.delete).toHaveBeenCalledWith(mockFolder);
        });

        it('should return error if path not found', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await deleteFile(mockApp, 'missing.md');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found');
        });
    });

    describe('renameFile', () => {
        it('should rename file', async () => {
            const mockFile = new TFile();
            mockFile.path = 'old.md';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);

            const result = await renameFile(mockApp, 'old.md', 'new.md');

            expect(result.success).toBe(true);
            expect(mockFileManager.renameFile).toHaveBeenCalledWith(mockFile, 'new.md');
        });

        it('should rename folder', async () => {
            const mockFolder = new TFolder();
            mockFolder.path = 'old-folder';
            mockVault.getAbstractFileByPath.mockReturnValue(mockFolder);

            const result = await renameFile(mockApp, 'old-folder', 'new-folder');

            expect(result.success).toBe(true);
            expect(mockFileManager.renameFile).toHaveBeenCalledWith(mockFolder, 'new-folder');
        });

        it('should return error if path not found', async () => {
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await renameFile(mockApp, 'missing.md', 'new.md');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path not found');
        });
    });
});

