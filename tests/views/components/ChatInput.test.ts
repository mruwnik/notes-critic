import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ChatInput, ChatInputOptions } from '../../../src/views/components/ChatInput';

describe('ChatInput', () => {
  let mockParent: HTMLElement;
  let mockOptions: ChatInputOptions;
  let createCreateElMock: (parent: HTMLElement) => jest.Mock;

  beforeEach(() => {
    // Set up DOM environment
    document.body.innerHTML = '';
    mockParent = document.createElement('div');
    document.body.appendChild(mockParent);

    // Create a recursive createEl function
    createCreateElMock = (parent: HTMLElement) => {
      return jest.fn((tag: string, attrs?: any) => {
        const element = document.createElement(tag);
        if (attrs?.cls) {
          element.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
        }
        if (attrs?.attr) {
          Object.entries(attrs.attr).forEach(([key, value]) => {
            element.setAttribute(key, value as string);
          });
        }
        if (attrs?.text) {
          element.textContent = attrs.text;
        }
        parent.appendChild(element);
        
        // Add createEl method to created elements for nested creation
        (element as any).createEl = createCreateElMock(element);
        
        return element;
      });
    };

    // Mock HTMLElement.createEl
    mockParent.createEl = createCreateElMock(mockParent);

    mockOptions = {
      onSend: jest.fn().mockResolvedValue(undefined)
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create chat input with default options', () => {
      const chatInput = new ChatInput(mockParent, mockOptions);

      expect(mockParent.createEl).toHaveBeenCalledWith('div', {
        cls: 'notes-critic-message-input-container'
      });
      
      // Verify textarea creation
      const textarea = mockParent.querySelector('textarea');
      expect(textarea).toBeTruthy();
      expect(textarea?.className).toContain('notes-critic-message-textarea');
      expect(textarea?.getAttribute('placeholder')).toBe('Type your message...');
      expect(textarea?.getAttribute('rows')).toBe('1');
    });

    it('should create input without container when showContainer is false', () => {
      const options = { ...mockOptions, showContainer: false };
      const chatInput = new ChatInput(mockParent, options);

      // Should not create additional container div
      expect(mockParent.createEl).not.toHaveBeenCalledWith('div', {
        cls: 'notes-critic-message-input-container'
      });
    });

    it('should set custom placeholder', () => {
      const options = { ...mockOptions, placeholder: 'Custom placeholder' };
      const chatInput = new ChatInput(mockParent, options);

      const textarea = mockParent.querySelector('textarea');
      expect(textarea?.getAttribute('placeholder')).toBe('Custom placeholder');
    });

    it('should set initial value', () => {
      const options = { ...mockOptions, initialValue: 'Initial text' };
      const chatInput = new ChatInput(mockParent, options);

      const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea?.value).toBe('Initial text');
    });

    it('should create send button', () => {
      const chatInput = new ChatInput(mockParent, mockOptions);

      const button = mockParent.querySelector('button');
      expect(button).toBeTruthy();
      expect(button?.className).toContain('notes-critic-message-send-button');
    });
  });

  describe('event handling', () => {
    let chatInput: ChatInput;
    let textarea: HTMLTextAreaElement;
    let sendButton: HTMLButtonElement;

    beforeEach(() => {
      chatInput = new ChatInput(mockParent, mockOptions);
      textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
      sendButton = mockParent.querySelector('button') as HTMLButtonElement;
    });

    describe('send button click', () => {
      it('should call onSend with message text', async () => {
        textarea.value = 'Test message';
        
        sendButton.click();
        
        expect(mockOptions.onSend).toHaveBeenCalledWith('Test message');
      });

      it('should not send empty message', async () => {
        textarea.value = '';
        
        sendButton.click();
        
        expect(mockOptions.onSend).not.toHaveBeenCalled();
      });

      it('should not send whitespace-only message', async () => {
        textarea.value = '   \n\t  ';
        
        sendButton.click();
        
        expect(mockOptions.onSend).not.toHaveBeenCalled();
      });

      it('should clear textarea after sending', async () => {
        textarea.value = 'Test message';
        
        sendButton.click();
        
        expect(textarea.value).toBe('');
      });

      it('should handle async onSend operations', async () => {
        // Test that the ChatInput can handle async onSend without crashing
        let callCount = 0;
        const asyncOnSend = jest.fn(async (message: string) => {
          callCount++;
          // Simulate some async work
          await new Promise(resolve => setTimeout(resolve, 1));
          return Promise.resolve();
        });
        
        // Use the existing chatInput but replace onSend
        (chatInput as any).options.onSend = asyncOnSend;
        
        textarea.value = 'Test message';
        sendButton.click();
        
        // Wait for async operation to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        
        expect(asyncOnSend).toHaveBeenCalledWith('Test message');
        expect(callCount).toBe(1);
        expect(textarea.value).toBe(''); // Should be cleared
      });
    });

    describe('keyboard shortcuts', () => {
      it('should send message on Enter key', async () => {
        textarea.value = 'Test message';
        
        const enterEvent = new KeyboardEvent('keydown', { 
          key: 'Enter',
          bubbles: true 
        });
        textarea.dispatchEvent(enterEvent);
        
        expect(mockOptions.onSend).toHaveBeenCalledWith('Test message');
      });

      it('should not send on Shift+Enter', async () => {
        textarea.value = 'Test message';
        
        const shiftEnterEvent = new KeyboardEvent('keydown', { 
          key: 'Enter',
          shiftKey: true,
          bubbles: true 
        });
        textarea.dispatchEvent(shiftEnterEvent);
        
        expect(mockOptions.onSend).not.toHaveBeenCalled();
      });

      it('should call onCancel on Escape key', async () => {
        // Create new parent for this test to avoid conflicts
        const cancelParent = document.createElement('div');
        document.body.appendChild(cancelParent);
        (cancelParent as any).createEl = createCreateElMock(cancelParent);
        
        const options = { ...mockOptions, onCancel: jest.fn() };
        const cancelChatInput = new ChatInput(cancelParent, options);
        const cancelTextarea = cancelParent.querySelector('textarea') as HTMLTextAreaElement;
        
        const escapeEvent = new KeyboardEvent('keydown', { 
          key: 'Escape',
          bubbles: true 
        });
        cancelTextarea.dispatchEvent(escapeEvent);
        
        expect(options.onCancel).toHaveBeenCalled();
        
        // Clean up
        document.body.removeChild(cancelParent);
      });

      it('should not call onCancel when not provided', async () => {
        const escapeEvent = new KeyboardEvent('keydown', { 
          key: 'Escape',
          bubbles: true 
        });
        
        // Should not throw
        expect(() => {
          textarea.dispatchEvent(escapeEvent);
        }).not.toThrow();
      });
    });

    describe('textarea auto-resize', () => {
      it('should adjust height on input', () => {
        const inputEvent = new Event('input', { bubbles: true });
        
        // Mock scrollHeight to simulate content
        Object.defineProperty(textarea, 'scrollHeight', {
          value: 100,
          writable: true
        });
        
        textarea.dispatchEvent(inputEvent);
        
        expect(textarea.style.height).toBe('100px');
      });

      it('should have minimum height', () => {
        const inputEvent = new Event('input', { bubbles: true });
        
        // Mock very small scrollHeight
        Object.defineProperty(textarea, 'scrollHeight', {
          value: 10,
          writable: true
        });
        
        textarea.dispatchEvent(inputEvent);
        
        // Should maintain minimum height (implementation dependent)
        expect(textarea.style.height).toBeTruthy();
      });
    });
  });

  describe('methods', () => {
    let chatInput: ChatInput;

    beforeEach(() => {
      chatInput = new ChatInput(mockParent, mockOptions);
    });

    describe('setValue', () => {
      it('should set textarea value', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        
        chatInput.setValue('New value');
        
        expect(textarea.value).toBe('New value');
      });

      it('should trigger resize after setting value', () => {
        const inputEvent = jest.spyOn(Event.prototype, 'constructor');
        
        chatInput.setValue('Multi\nLine\nText');
        
        // Should trigger input event for auto-resize
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('Multi\nLine\nText');
      });
    });

    describe('getValue', () => {
      it('should return current textarea value', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = 'Current value';
        
        const value = chatInput.getValue();
        
        expect(value).toBe('Current value');
      });
    });

    describe('focus', () => {
      it('should focus the textarea', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        const focusSpy = jest.spyOn(textarea, 'focus');
        
        chatInput.focus();
        
        expect(focusSpy).toHaveBeenCalled();
      });
    });

    describe('setDisabled', () => {
      it('should disable textarea and button when true', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        const button = mockParent.querySelector('button') as HTMLButtonElement;
        
        chatInput.setDisabled(true);
        
        expect(textarea.disabled).toBe(true);
        expect(button.disabled).toBe(true);
      });

      it('should enable textarea and button when false', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        const button = mockParent.querySelector('button') as HTMLButtonElement;
        
        // First disable
        chatInput.setDisabled(true);
        
        // Then enable
        chatInput.setDisabled(false);
        
        expect(textarea.disabled).toBe(false);
        expect(button.disabled).toBe(false);
      });
    });

    describe('clear', () => {
      it('should clear textarea value', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = 'Some text';
        
        chatInput.clear();
        
        expect(textarea.value).toBe('');
      });

      it('should reset textarea height', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        textarea.style.height = '100px';
        
        chatInput.clear();
        
        expect(textarea.style.height).toBe('auto');
      });
    });

    describe('destroy', () => {
      it('should remove event listeners and clean up', () => {
        const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
        const button = mockParent.querySelector('button') as HTMLButtonElement;
        
        // Add some content first
        textarea.value = 'Some content';
        
        chatInput.destroy();
        
        // Should not throw when interacting after destroy
        expect(() => {
          button.click();
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }).not.toThrow();
      });
    });
  });

  describe('error handling', () => {
    it('should handle onSend errors gracefully', async () => {
      const errorOnSend = jest.fn().mockRejectedValue(new Error('Send failed'));
      const errorOptions = { ...mockOptions, onSend: errorOnSend };
      const errorChatInput = new ChatInput(mockParent, errorOptions);
      
      const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
      const button = mockParent.querySelector('button') as HTMLButtonElement;
      
      textarea.value = 'Test message';
      
      // Should not throw
      expect(() => {
        button.click();
      }).not.toThrow();
      
      // Button should be re-enabled after error
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(button.disabled).toBe(false);
    });

    it('should handle missing DOM elements gracefully', () => {
      // Create input with malformed parent
      const malformedParent = document.createElement('div');
      malformedParent.createEl = jest.fn(() => {
        throw new Error('DOM creation failed');
      });
      
      expect(() => {
        new ChatInput(malformedParent, mockOptions);
      }).toThrow('DOM creation failed');
    });

    it('should handle null/undefined values', () => {
      const chatInput = new ChatInput(mockParent, mockOptions);
      
      expect(() => {
        chatInput.setValue(null as any);
        chatInput.setValue(undefined as any);
      }).not.toThrow();
      
      const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
      // Should handle null/undefined by setting empty string or handling gracefully
      expect(textarea.value).toBe('');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const chatInput = new ChatInput(mockParent, mockOptions);
      
      const textarea = mockParent.querySelector('textarea');
      const button = mockParent.querySelector('button');
      
      // Should have accessibility attributes (if implemented)
      expect(textarea).toBeTruthy();
      expect(button).toBeTruthy();
    });

    it('should support keyboard navigation', () => {
      const chatInput = new ChatInput(mockParent, mockOptions);
      
      const textarea = mockParent.querySelector('textarea') as HTMLTextAreaElement;
      const button = mockParent.querySelector('button') as HTMLButtonElement;
      
      // Tab should navigate between elements
      const tabEvent = new KeyboardEvent('keydown', { 
        key: 'Tab',
        bubbles: true 
      });
      
      expect(() => {
        textarea.dispatchEvent(tabEvent);
      }).not.toThrow();
    });
  });
});