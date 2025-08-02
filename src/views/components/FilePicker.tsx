import React, { useState, useRef, useEffect } from 'react';
import { TFile, TFolder, Vault } from 'obsidian';
import { LLMFile } from 'types';

interface FilePickerProps {
    vault: Vault;
    onFilesChange: (files: LLMFile[]) => void;
    selectedFiles: LLMFile[];
}

interface FileResult {
    name: string;
    path: string;
    score: number;
    type: 'file' | 'folder';
}

const CSS_CLASSES = {
    container: 'nc-relative nc-w-full',
    trigger: 'nc-bg-secondary nc-text-normal nc-px-2 nc-rounded-sm nc-text-xs nc-flex nc-items-center nc-gap-1 nc-cursor-pointer nc-hover:opacity-80 nc-flex-shrink-0',
    dropdown: 'nc-absolute nc-top-full nc-left-0 nc-w-96 nc-max-h-48 nc-bg-primary nc-border nc-rounded nc-shadow-md nc-z-1000 nc-overflow-hidden',
    searchContainer: 'nc-p-3 nc-border-b',
    searchInput: 'nc-w-full nc-input nc-text-sm',
    resultsList: 'nc-overflow-y-auto nc-max-h-32',
    resultItem: 'nc-flex nc-items-center nc-gap-2 nc-p-2 nc-cursor-pointer nc-hover:bg-secondary',
    resultIcon: 'nc-text-xs nc-text-muted',
    resultName: 'nc-text-sm nc-flex-1',
    resultPath: 'nc-text-xs nc-text-muted',
    selectedFiles: 'nc-flex nc-flex-wrap nc-gap-1 nc-mb-2 nc-w-full nc-overflow-hidden',
    selectedFile: 'nc-bg-accent nc-text-on-accent nc-px-2 nc-rounded-sm nc-text-xs nc-flex nc-items-center nc-gap-1 nc-cursor-pointer nc-hover:opacity-80 nc-flex-shrink-0'
};

// Pure helper functions
const getFileType = (extension: string): 'text' | 'image' | 'pdf' => {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const textExts = ['md', 'txt', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'json', 'yaml', 'yml'];
    
    if (imageExts.includes(extension.toLowerCase())) return 'image';
    if (extension.toLowerCase() === 'pdf') return 'pdf';
    return 'text';
};

const fuzzySearchGeneric = (query: string, items: (TFile | TFolder)[], type: 'file' | 'folder'): FileResult[] => {
    if (!query) return [];
    
    const queryLower = query.toLowerCase();
    const results: FileResult[] = [];
    
    for (const item of items) {
        const itemName = item.name.toLowerCase();
        const itemPath = item.path.toLowerCase();
        
        // Simple fuzzy matching - check if all query characters appear in order
        let score = 0;
        let queryIndex = 0;
        let lastMatchIndex = -1;
        
        for (let i = 0; i < itemName.length && queryIndex < queryLower.length; i++) {
            if (itemName[i] === queryLower[queryIndex]) {
                const distance = i - lastMatchIndex;
                score += 1 / distance; // Closer matches get higher scores
                lastMatchIndex = i;
                queryIndex++;
            }
        }
        
        // Also check path for matches
        if (queryIndex < queryLower.length) {
            for (let i = 0; i < itemPath.length && queryIndex < queryLower.length; i++) {
                if (itemPath[i] === queryLower[queryIndex]) {
                    score += 0.5; // Path matches get lower score than name matches
                    queryIndex++;
                }
            }
        }
        
        // Only include if all characters matched
        if (queryIndex === queryLower.length) {
            results.push({
                name: item.name,
                path: item.path,
                score: score,
                type: type
            });
        }
    }
    
    // Sort by score (higher is better) and limit results
    return results.sort((a, b) => b.score - a.score).slice(0, 8);
};

const fuzzySearchFiles = (query: string, files: TFile[]): FileResult[] => {
    return fuzzySearchGeneric(query, files, 'file');
};

const fuzzySearchFolders = (query: string, folders: TFolder[]): FileResult[] => {
    return fuzzySearchGeneric(query, folders, 'folder');
};

export const FilePicker: React.FC<FilePickerProps> = ({ vault, onFilesChange, selectedFiles }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [allFiles, setAllFiles] = useState<TFile[]>([]);
    const [allFolders, setAllFolders] = useState<TFolder[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<FileResult[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadAllFiles();
    }, [vault]);

    useEffect(() => {
        // Refresh files when dropdown opens to catch newly created files
        if (isOpen) {
            loadAllFiles();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (searchQuery) {
            const fileResults = fuzzySearchFiles(searchQuery, allFiles);
            const folderResults = fuzzySearchFolders(searchQuery, allFolders);
            const combined = [...fileResults, ...folderResults].sort((a, b) => b.score - a.score);
            setFilteredFiles(combined);
        } else {
            // Show first 15 files and 5 folders when no search query
            const fileResults = allFiles.slice(0, 15).map(file => ({
                name: file.name,
                path: file.path,
                score: 0,
                type: 'file' as const
            }));
            const folderResults = allFolders.slice(0, 5).map(folder => ({
                name: folder.name,
                path: folder.path,
                score: 0,
                type: 'folder' as const
            }));
            setFilteredFiles([...folderResults, ...fileResults]);
        }
    }, [searchQuery, allFiles, allFolders]);

    const loadAllFiles = () => {
        const files = vault.getMarkdownFiles();
        setAllFiles(files);
        
        // Get all folders, excluding .obsidian and root folder
        const folders = vault.getAllLoadedFiles()
            .filter(f => f instanceof TFolder && !f.path.startsWith('.obsidian') && !['', '/'].includes(f.path)) as TFolder[];
        setAllFolders(folders);
    };

    const loadFileAsLLMFile = async (file: TFile): Promise<LLMFile | null> => {
        try {
            const content = await vault.read(file);
            return {
                type: getFileType(file.extension),
                path: file.path,
                content: content,
                name: file.name
            };
        } catch (error) {
            console.error(`Error reading file ${file.path}:`, error);
            return null;
        }
    };

    const selectFile = async (itemPath: string) => {
        const isSelected = selectedFiles.some(f => f.path === itemPath);
        
        if (isSelected) {
            // Unselect the file/folder
            const newFiles = selectedFiles.filter(f => f.path !== itemPath);
            onFilesChange(newFiles);
            return;
        }
        
        const item = vault.getAbstractFileByPath(itemPath);
        
        if (item instanceof TFile) {
            // Handle single file
            const llmFile = await loadFileAsLLMFile(item);
            if (llmFile) {
                onFilesChange([...selectedFiles, llmFile]);
                setSearchQuery('');
            }
        } else if (item instanceof TFolder) {
            // Handle folder - add all markdown files in folder
            try {
                const folderFiles = vault.getMarkdownFiles().filter(file => 
                    file.path.startsWith(item.path + '/')
                );
                
                const newFiles: LLMFile[] = [];
                for (const file of folderFiles) {
                    // Skip if already selected
                    if (selectedFiles.some(f => f.path === file.path)) continue;
                    
                    const llmFile = await loadFileAsLLMFile(file);
                    if (llmFile) {
                        newFiles.push(llmFile);
                    }
                }
                
                if (newFiles.length > 0) {
                    onFilesChange([...selectedFiles, ...newFiles]);
                    setSearchQuery('');
                }
            } catch (error) {
                console.error('Error reading folder:', error);
            }
        }
    };

    const removeFile = (filePath: string) => {
        const newFiles = selectedFiles.filter(f => f.path !== filePath);
        onFilesChange(newFiles);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            // TODO: Implement keyboard navigation
        } else if (e.key === 'Enter' && filteredFiles.length > 0) {
            e.preventDefault();
            selectFile(filteredFiles[0].path);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setSearchQuery('');
        }
    };

    return (
        <div className={CSS_CLASSES.container} ref={dropdownRef}>
            <div className={CSS_CLASSES.selectedFiles} style={{ width: '100%', flexWrap: 'wrap' }}>
                <div
                    className={CSS_CLASSES.trigger}
                    onClick={() => setIsOpen(!isOpen)}
                    title="Add files, folders, docs..."
                >
                    {selectedFiles.length === 0 ? '@ Add content' : '@'}
                </div>
                {selectedFiles.map(file => (
                    <div 
                        key={file.path} 
                        className={CSS_CLASSES.selectedFile}
                        onClick={() => removeFile(file.path)}
                        title={`Remove ${file.name}`}
                    >
                        <span>📄</span>
                        <span>{file.name}</span>
                    </div>
                ))}
            </div>
            
            {isOpen && (
                <div className={CSS_CLASSES.dropdown}>
                    <div className={CSS_CLASSES.searchContainer}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            className={CSS_CLASSES.searchInput}
                            placeholder="Add files, folders, docs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                    </div>
                    <div className={CSS_CLASSES.resultsList}>
                        {filteredFiles.map(item => {
                            const isSelected = selectedFiles.some(f => f.path === item.path);
                            const icon = item.type === 'folder' ? '📁' : '📄';
                            return (
                                <div
                                    key={item.path}
                                    className={CSS_CLASSES.resultItem}
                                    onClick={() => selectFile(item.path)}
                                    style={{ opacity: isSelected ? 0.5 : 1 }}
                                >
                                    <span className={CSS_CLASSES.resultIcon}>{icon}</span>
                                    <div className="nc-flex nc-flex-col nc-flex-1">
                                        <span className={CSS_CLASSES.resultName}>{item.name}</span>
                                        <span className={CSS_CLASSES.resultPath}>{item.path}</span>
                                    </div>
                                    {isSelected && <span className={CSS_CLASSES.resultIcon}>✓</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};