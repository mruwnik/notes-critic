import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';

const CSS_CLASSES = {
    inputContainer: 'notes-critic-message-input-container',
    inputWrapper: 'notes-critic-message-input-wrapper',
    textArea: 'notes-critic-message-textarea',
    sendButton: 'notes-critic-message-send-button'
};

export interface ChatInputProps {
    placeholder?: string;
    initialValue?: string;
    showContainer?: boolean;
    onSend: (message: string) => Promise<void>;
    onCancel?: () => void;
    disabled?: boolean;
}

export const ChatInputReact = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(({
    placeholder = 'Type your message...',
    initialValue = '',
    showContainer = true,
    onSend,
    onCancel,
    disabled = false
}, ref) => {
    const [value, setValue] = useState(initialValue);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    
    // Combine external ref with internal ref
    React.useImperativeHandle(ref, () => textAreaRef.current!, []);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    useEffect(() => {
        autoResize();
    }, [value]);

    const autoResize = () => {
        if (textAreaRef.current) {
            textAreaRef.current.style.height = 'auto';
            textAreaRef.current.style.height = Math.max(textAreaRef.current.scrollHeight, 20) + 'px';
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
            try {
                await onSend(message);
            } catch (error) {
                console.error('Send error:', error);
            }
        }
    };

    const inputWrapper = (
        <div className={CSS_CLASSES.inputWrapper}>
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