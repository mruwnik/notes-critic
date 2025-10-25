import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Vault, TFile } from 'obsidian';
import { LLMFile } from 'types';
import { FilePicker, getFileType } from './FilePicker';

const CSS_CLASSES = {
    inputContainer: 'nc-p-3 nc-border-t',
    inputWrapper: 'nc-relative nc-w-full',
    textArea: 'nc-w-full nc-input nc-resize-none nc-pr-12',
    sendButton: 'nc-btn nc-btn--primary nc-btn--square nc-absolute nc-bottom-2 nc-right-2 nc-opacity-60 nc-hover\:opacity-80'
};

export interface ChatInputProps {
    placeholder?: string;
    initialValue?: string;
    showContainer?: boolean;
    onSend: (message: string, files?: LLMFile[]) => Promise<void>;
    onCancel?: () => void;
    disabled?: boolean;
    vault?: Vault;
}

export const ChatInputReact = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(({
    placeholder = 'Type your message...',
    initialValue = '',
    showContainer = true,
    onSend,
    onCancel,
    disabled = false,
    vault
}, ref) => {
    const [value, setValue] = useState(initialValue);
    const [selectedFiles, setSelectedFiles] = useState<LLMFile[]>([]);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    
    // Combine external ref with internal ref
    React.useImperativeHandle(ref, () => textAreaRef.current!, []);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    useEffect(() => {
        autoResize();
        scrollToKeepInputVisible();
        extractLinksAsFiles();
    }, [value]);

    const autoResize = () => {
        if (textAreaRef.current) {
            const textarea = textAreaRef.current;
            
            // Reset to 1 to get accurate scrollHeight measurement
            textarea.rows = 1;
            
            const style = window.getComputedStyle(textarea);
            const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize)
            const contentHeight = textarea.scrollHeight;
            textarea.rows = Math.max(1, Math.round(contentHeight / lineHeight) - 1);
        }
    };

    const scrollToKeepInputVisible = () => {
        if (textAreaRef.current) {
            // Find the closest scrollable parent container
            let element = textAreaRef.current.parentElement;
            while (element) {
                const style = window.getComputedStyle(element);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    // Found the scrollable container, scroll to bottom to keep input visible
                    element.scrollTop = element.scrollHeight;
                    break;
                }
                element = element.parentElement;
            }
        }
    };

    const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await handleSend();
        } else if (e.key === 'Escape' && onCancel) {
            onCancel();
        }
    };

    const handleSend = async () => {
        const message = value.trim();
        if (message && !disabled) {
            setValue('');
            setSelectedFiles([]);
            try {
                await onSend(message, selectedFiles.length > 0 ? selectedFiles : undefined);
            } catch (error) {
                console.error('Send error:', error);
            }
        }
    };

    const extractLinksAsFiles = () => {
        if (!vault) return;

        const resolveFile = (filePath: string): TFile | null => {
            const file = vault.getAbstractFileByPath(filePath) || 
                        vault.getAbstractFileByPath(filePath + '.md') ||
                        vault.getAllLoadedFiles().find(f => 
                            f instanceof TFile && (f.basename === filePath || f.path === filePath)
                        );
            return file instanceof TFile ? file : null;
        };

        const extractFromUri = (uri: string) => {
            const match = uri.match(/[?&]file=([^&\s]+)/);
            return match ? decodeURIComponent(match[1]) : null;
        };

        let newValue = value;
        const patterns = [
            { regex: /obsidian:\/\/open\?[^\s]+/g, extract: (m: RegExpMatchArray) => extractFromUri(m[0]) },
            { regex: /\[\[([^\]]+)\]\]/g, extract: (m: RegExpMatchArray) => m[1] }
        ];

        const newFiles = patterns.flatMap(({ regex, extract }) =>
            [...value.matchAll(regex)].flatMap(match => {
                const filePath = extract(match);
                const file = filePath && resolveFile(filePath);
                if (file) {
                    newValue = newValue.replace(match[0], '');
                    return [{ type: getFileType(file.extension), path: file.path, name: file.name, isFolder: false } as LLMFile];
                }
                return [];
            })
        );

        if (newFiles.length > 0) {
            setValue(newValue.replace(/\n{3,}/g, '\n\n').trim());
            setSelectedFiles(prev => {
                const existing = new Set(prev.map(f => f.path));
                return [...prev, ...newFiles.filter(f => !existing.has(f.path))];
            });
        }
    };

    const inputWrapper = (
        <div className={CSS_CLASSES.inputWrapper}>
            {vault && (
                <FilePicker
                    vault={vault}
                    onFilesChange={setSelectedFiles}
                    selectedFiles={selectedFiles}
                />
            )}
            <textarea
                ref={textAreaRef}
                className={CSS_CLASSES.textArea}
                placeholder={placeholder}
                rows={1}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
            />
            <button
                className={CSS_CLASSES.sendButton}
                title="Send message"
                disabled={disabled}
                onClick={handleSend}
            >
                ➤
            </button>
        </div>
    );

    if (showContainer === false) {
        return inputWrapper;
    }

    return (
        <div className={CSS_CLASSES.inputContainer}>
            {inputWrapper}
        </div>
    );
});