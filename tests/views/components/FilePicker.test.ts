import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { getFileType, fuzzySearchGeneric, fuzzySearchFiles, fuzzySearchFolders, loadLLMFileContent } from '../../../src/views/components/FilePicker';
import { LLMFile } from '../../../src/types';

// Mock Obsidian module
jest.mock('obsidian', () => ({
    TFile: class TFile {
        constructor(public path?: string, public name?: string, public extension?: string) {}
    },
    TFolder: class TFolder {
        constructor(public path?: string, public name?: string) {}
    },
    Vault: class Vault {}
}));

const { TFile, TFolder, Vault } = require('obsidian');

// Mock implementations
class MockTFile extends TFile {
    constructor(public path: string, public name: string, public extension: string) {
        super();
        this.path = path;
        this.name = name;
        this.extension = extension;
    }
}

class MockTFolder extends TFolder {
    constructor(public path: string, public name: string) {
        super();
        this.path = path;
        this.name = name;
    }
}

class MockVault {
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
        return this.files.filter(f => f.extension === 'md') as unknown as TFile[];
    }

    getAllLoadedFiles() {
        return [...this.files, ...this.folders] as unknown as (TFile | TFolder)[];
    }

    getAbstractFileByPath(path: string) {
        const file = this.files.find(f => f.path === path);
        if (file) return file as unknown as TFile;
        
        const folder = this.folders.find(f => f.path === path);
        if (folder) return folder as unknown as TFolder;
        
        return null;
    }

    async read(file: TFile) {
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
            new MockTFile('notes/test.md', 'test.md', 'md'),
            new MockTFile('projects/project1.md', 'project1.md', 'md'),
            new MockTFile('ideas/brilliant-idea.md', 'brilliant-idea.md', 'md'),
            new MockTFile('archive/old-notes.md', 'old-notes.md', 'md')
        ] as unknown as TFile[];

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
                expect(results[i-1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });

        it('should limit results to 8 items', () => {
            const manyFiles = Array.from({ length: 20 }, (_, i) => 
                new MockTFile(`file${i}.md`, `file${i}.md`, 'md')
            ) as unknown as TFile[];
            
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
            const testFile = new MockTFile('test.md', 'test.md', 'md');
            mockVault.setFiles([testFile]);
            mockVault.setFileContent('test.md', '# Test Content');

            const llmFile: LLMFile = {
                type: 'text',
                path: 'test.md',
                name: 'test.md',
                isFolder: false
            };

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFile);
            
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFile);
            
            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('# Already Loaded');
        });

        it('should handle file read errors gracefully', async () => {
            const testFile = new MockTFile('missing.md', 'missing.md', 'md');
            mockVault.setFiles([testFile]);
            // Don't set content, so read will fail

            const llmFile: LLMFile = {
                type: 'text',
                path: 'missing.md',
                name: 'missing.md',
                isFolder: false
            };

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFile);
            expect(results).toHaveLength(0);
        });
    });

    describe('Folder Loading', () => {
        beforeEach(() => {
            const files = [
                new MockTFile('folder/file1.md', 'file1.md', 'md'),
                new MockTFile('folder/file2.md', 'file2.md', 'md'),
                new MockTFile('folder/subfolder/file3.md', 'file3.md', 'md'),
                new MockTFile('other/file4.md', 'file4.md', 'md')
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFolder);
            
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFolder);
            
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFolder);
            
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFolder);
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

            const results = await loadLLMFileContent(mockVault as unknown as Vault, llmFolder);
            
            // Should still get the files that loaded successfully
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(f => f.path === 'folder/file1.md')).toBe(true);
        });
    });
});

describe('FilePicker Edge Cases', () => {
    it('should handle files with special characters in names', () => {
        const specialFiles = [
            new MockTFile('special/file-name.md', 'file-name.md', 'md'),
            new MockTFile('special/file_with_underscores.md', 'file_with_underscores.md', 'md'),
            new MockTFile('special/file (with) parens.md', 'file (with) parens.md', 'md')
        ] as unknown as TFile[];

        const results = fuzzySearchGeneric('file', specialFiles, 'file');
        expect(results.length).toBe(3);
    });

    it('should handle paths with multiple slashes', () => {
        const files = [
            new MockTFile('deep/nested/folder/file.md', 'file.md', 'md')
        ] as unknown as TFile[];

        const results = fuzzySearchGeneric('nested', files, 'file');
        expect(results).toHaveLength(1);
    });
});