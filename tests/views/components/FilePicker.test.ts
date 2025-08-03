import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { getFileType, fuzzySearchGeneric, fuzzySearchFiles, fuzzySearchFolders, loadLLMFileContent } from '../../../src/views/components/FilePicker';
import { LLMFile } from '../../../src/types';

// Mock Obsidian module
jest.mock('obsidian', () => ({
    TFile: class TFile {
        constructor(public path?: string, public name?: string, public extension?: string) { }
    },
    TFolder: class TFolder {
        constructor(public path?: string, public name?: string) { }
    },
    Vault: class Vault { }
}));

const { TFile, TFolder, Vault } = require('obsidian');

// Mock implementations
class MockTFile extends TFile {
    constructor(public path: string, public name: string, public extension: string, public vault: MockVault, public parent: MockTFolder, public stat: { mtime: number, ctime: number, size: number }, public basename: string) {
        super();
        this.path = path;
        this.name = name;
        this.extension = extension;
    }

    public static create(path: string, name: string, extension: string = 'md') {
        const vault = new MockVault();
        const parent = MockTFolder.create(path.split('/').slice(0, -1).join('/'), path.split('/').slice(0, -1).join('/'));
        return new MockTFile(path, name, extension, vault, parent, { mtime: 0, ctime: 0, size: 0 }, name);
    }
}

class MockTFolder extends TFolder {
    constructor(public path: string, public name: string, public vault: MockVault, public parent: MockTFolder, public stat: { mtime: number, ctime: number, size: number }, public basename: string) {
        super();
        this.path = path;
        this.name = name;
        this.basename = name;
        this.vault = vault;
        this.parent = parent;
        this.stat = { mtime: 0, ctime: 0, size: 0 };
        this.basename = name;
    }

    public static create(path: string, name: string) {
        const vault = new MockVault();
        const parent = MockTFolder.create(path.split('/').slice(0, -1).join('/'), path.split('/').slice(0, -1).join('/'));
        return new MockTFolder(path, name, vault, parent, { mtime: 0, ctime: 0, size: 0 }, name);
    }
}

class MockVault extends Vault {
    private files: MockTFile[] = [];
    private folders: MockTFolder[] = [];
    private fileContents: Map<string, string> = new Map();

    setFiles(files: MockTFile[]) {
        this.files = files;
    }

    setFolders(folders: MockTFolder[]) {
        this.folders = folders;
    }

    setFileContent(path: string, content: string) {
        this.fileContents.set(path, content);
    }

    getMarkdownFiles() {
        return this.files.filter(f => f.extension === 'md');
    }

    getAllLoadedFiles() {
        return [...this.files, ...this.folders];
    }

    getAbstractFileByPath(path: string) {
        const file = this.files.find(f => f.path === path);
        if (file) return file;

        const folder = this.folders.find(f => f.path === path);
        if (folder) return folder;

        return null;
    }

    async read(file: typeof TFile) {
        const content = this.fileContents.get(file.path);
        if (content === undefined) {
            throw new Error(`File not found: ${file.path}`);
        }
        return content;
    }
}

describe('FilePicker Pure Functions', () => {
    describe('getFileType', () => {
        it('should identify markdown files as text', () => {
            expect(getFileType('md')).toBe('text');
        });

        it('should identify image files', () => {
            expect(getFileType('png')).toBe('image');
            expect(getFileType('jpg')).toBe('image');
            expect(getFileType('jpeg')).toBe('image');
            expect(getFileType('gif')).toBe('image');
        });

        it('should identify PDF files', () => {
            expect(getFileType('pdf')).toBe('pdf');
        });

        it('should handle case insensitive extensions', () => {
            expect(getFileType('PNG')).toBe('image');
            expect(getFileType('PDF')).toBe('pdf');
            expect(getFileType('MD')).toBe('text');
        });

        it('should default to text for unknown extensions', () => {
            expect(getFileType('unknown')).toBe('text');
        });
    });

    describe('fuzzySearchGeneric', () => {
        const mockFiles = [
            MockTFile.create('notes/test.md', 'test.md'),
            MockTFile.create('projects/project1.md', 'project1.md'),
            MockTFile.create('ideas/brilliant-idea.md', 'brilliant-idea.md'),
            MockTFile.create('archive/old-notes.md', 'old-notes.md')
        ];

        it('should return empty array for empty query', () => {
            const results = fuzzySearchGeneric('', mockFiles, 'file');
            expect(results).toEqual([]);
        });

        it('should find exact matches', () => {
            const results = fuzzySearchGeneric('test', mockFiles, 'file');
            expect(results.length).toBeGreaterThan(0);
            // The exact match should be first due to higher score
            expect(results[0].name).toBe('test.md');
        });

        it('should find fuzzy matches', () => {
            const results = fuzzySearchGeneric('proj', mockFiles, 'file');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('project1.md');
        });

        it('should find matches in file paths', () => {
            const results = fuzzySearchGeneric('archive', mockFiles, 'file');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('old-notes.md');
        });

        it('should return results sorted by score', () => {
            const results = fuzzySearchGeneric('i', mockFiles, 'file');
            expect(results.length).toBeGreaterThan(0);
            // Results should be sorted by score (higher first)
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });

        it('should limit results to 8 items', () => {
            const manyFiles = Array.from({ length: 20 }, (_, i) =>
                MockTFile.create(`file${i}.md`, `file${i}.md`)
            );

            const results = fuzzySearchGeneric('file', manyFiles, 'file');
            expect(results.length).toBeLessThanOrEqual(8);
        });
    });
});

describe('loadLLMFileContent', () => {
    let mockVault: MockVault;

    beforeEach(() => {
        mockVault = new MockVault();
    });

    describe('File Loading', () => {
        it('should load content for a single file', async () => {
            const testFile = MockTFile.create('test.md', 'test.md');
            mockVault.setFiles([testFile]);
            mockVault.setFileContent('test.md', '# Test Content');

            const llmFile: LLMFile = {
                type: 'text',
                path: 'test.md',
                name: 'test.md',
                isFolder: false
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFile);

            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('# Test Content');
            expect(results[0].path).toBe('test.md');
        });

        it('should return file as-is if content already loaded', async () => {
            const llmFile: LLMFile = {
                type: 'text',
                path: 'test.md',
                name: 'test.md',
                content: '# Already Loaded',
                isFolder: false
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFile);

            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('# Already Loaded');
        });

        it('should handle file read errors gracefully', async () => {
            const testFile = MockTFile.create('missing.md', 'missing.md');
            mockVault.setFiles([testFile]);
            // Don't set content, so read will fail

            const llmFile: LLMFile = {
                type: 'text',
                path: 'missing.md',
                name: 'missing.md',
                isFolder: false
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFile);
            expect(results).toHaveLength(0);
        });
    });

    describe('Folder Loading', () => {
        beforeEach(() => {
            const files = [
                MockTFile.create('folder/file1.md', 'file1.md'),
                MockTFile.create('folder/file2.md', 'file2.md'),
                MockTFile.create('folder/subfolder/file3.md', 'file3.md'),
                MockTFile.create('other/file4.md', 'file4.md')
            ];

            mockVault.setFiles(files);
            mockVault.setFileContent('folder/file1.md', '# File 1');
            mockVault.setFileContent('folder/file2.md', '# File 2');
            mockVault.setFileContent('folder/subfolder/file3.md', '# File 3');
            mockVault.setFileContent('other/file4.md', '# File 4');
        });

        it('should load all files in a folder', async () => {
            const llmFolder: LLMFile = {
                type: 'folder',
                path: 'folder',
                name: 'folder',
                isFolder: true
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFolder);

            expect(results).toHaveLength(3); // folder/file1.md, folder/file2.md, folder/subfolder/file3.md

            const paths = results.map(f => f.path).sort();
            expect(paths).toEqual([
                'folder/file1.md',
                'folder/file2.md',
                'folder/subfolder/file3.md'
            ]);
        });

        it('should load content for all files in folder', async () => {
            const llmFolder: LLMFile = {
                type: 'folder',
                path: 'folder',
                name: 'folder',
                isFolder: true
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFolder);

            const file1 = results.find(f => f.path === 'folder/file1.md');
            expect(file1?.content).toBe('# File 1');

            const file2 = results.find(f => f.path === 'folder/file2.md');
            expect(file2?.content).toBe('# File 2');
        });

        it('should set isFolder to false for expanded files', async () => {
            const llmFolder: LLMFile = {
                type: 'folder',
                path: 'folder',
                name: 'folder',
                isFolder: true
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFolder);

            results.forEach(file => {
                expect(file.isFolder).toBe(false);
            });
        });

        it('should handle empty folders', async () => {
            const llmFolder: LLMFile = {
                type: 'folder',
                path: 'empty-folder',
                name: 'empty-folder',
                isFolder: true
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFolder);
            expect(results).toHaveLength(0);
        });

        it('should handle file read errors in folders gracefully', async () => {
            // Set up files but don't set content for one
            mockVault.setFileContent('folder/file1.md', '# File 1');
            // folder/file2.md will fail to read

            const llmFolder: LLMFile = {
                type: 'folder',
                path: 'folder',
                name: 'folder',
                isFolder: true
            };

            const results = await loadLLMFileContent(mockVault as unknown as typeof Vault, llmFolder);

            // Should still get the files that loaded successfully
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(f => f.path === 'folder/file1.md')).toBe(true);
        });
    });
});

describe('FilePicker Edge Cases', () => {
    it('should handle files with special characters in names', () => {
        const specialFiles = [
            MockTFile.create('special/file-name.md', 'file-name.md'),
            MockTFile.create('special/file_with_underscores.md', 'file_with_underscores.md'),
            MockTFile.create('special/file (with) parens.md', 'file (with) parens.md')
        ];

        const results = fuzzySearchGeneric('file', specialFiles, 'file');
        expect(results.length).toBe(3);
    });

    it('should handle paths with multiple slashes', () => {
        const files = [
            MockTFile.create('deep/nested/folder/file.md', 'file.md')
        ];

        const results = fuzzySearchGeneric('nested', files, 'file');
        expect(results).toHaveLength(1);
    });
});