import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ChatView } from '../../src/views/ChatView';
import { CHAT_VIEW_CONFIG } from '../../src/types';

// Mock dependencies
jest.mock('../../src/views/components/FeedbackDisplay');
jest.mock('../../src/views/components/ChatInput');
jest.mock('../../src/views/components/ControlPanel');
jest.mock('../../src/views/components/FileManager');
jest.mock('../../src/conversation/ConversationManager');
jest.mock('../../src/rules/RuleManager');
jest.mock('../../src/feedback/feedbackProvider');

describe('ChatView', () => {
  let chatView: ChatView;
  let mockLeaf: any;
  let mockPlugin: any;
  let mockApp: any;

  beforeEach(() => {
    // Mock DOM elements
    const mockContainer = document.createElement('div');
    const mockContentContainer = document.createElement('div');
    mockContainer.appendChild(mockContentContainer);

    mockApp = {
      workspace: {
        getActiveFile: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      },
      vault: {
        on: jest.fn(),
        off: jest.fn(),
        read: jest.fn(),
        modify: jest.fn()
      },
      metadataCache: {
        on: jest.fn(),
        off: jest.fn()
      }
    };

    mockLeaf = {
      detach: jest.fn(),
      view: null
    };

    mockPlugin = {
      settings: {
        feedbackThreshold: 3,
        feedbackCooldownSeconds: 30,
        systemPrompt: 'Test prompt',
        model: 'anthropic/claude-3-sonnet-20240229',
        anthropicApiKey: 'test-key',
        maxTokens: 2000,
        maxHistoryTokens: 4000,
        mcpEnabled: false,
        mcpServers: []
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: mockApp
    };

    chatView = new ChatView(mockLeaf, mockPlugin);
    
    // Mock containerEl
    Object.defineProperty(chatView, 'containerEl', {
      value: {
        children: [null, mockContentContainer],
        createEl: jest.fn((tag, attrs) => {
          const el = document.createElement(tag);
          if (attrs?.cls) {
            el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
          }
          return el;
        })
      },
      writable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('view configuration', () => {
    it('should return correct view type', () => {
      expect(chatView.getViewType()).toBe(CHAT_VIEW_CONFIG.type);
    });

    it('should return correct display text', () => {
      expect(chatView.getDisplayText()).toBe(CHAT_VIEW_CONFIG.name);
    });

    it('should return correct icon', () => {
      expect(chatView.getIcon()).toBe(CHAT_VIEW_CONFIG.icon);
    });
  });

  describe('onOpen', () => {
    it('should initialize UI components', async () => {
      await chatView.onOpen();
      
      // Verify that components are initialized
      expect(chatView['feedbackDisplay']).toBeDefined();
      expect(chatView['chatInput']).toBeDefined();
      expect(chatView['controlPanel']).toBeDefined();
      expect(chatView['fileManager']).toBeDefined();
    });

    it('should setup workspace event listeners', async () => {
      await chatView.onOpen();
      
      // Verify workspace events are registered
      expect(mockApp.workspace.on).toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
      expect(mockApp.vault.on).toHaveBeenCalledWith('modify', expect.any(Function));
      expect(mockApp.metadataCache.on).toHaveBeenCalledWith('resolved', expect.any(Function));
    });
  });

  describe('onClose', () => {
    it('should cleanup event listeners', async () => {
      await chatView.onOpen();
      chatView.onClose();
      
      // Verify workspace events are unregistered  
      expect(mockApp.workspace.off).toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
      expect(mockApp.vault.off).toHaveBeenCalledWith('modify', expect.any(Function));
      expect(mockApp.metadataCache.off).toHaveBeenCalledWith('resolved', expect.any(Function));
    });
  });

  describe('triggerFeedback', () => {
    beforeEach(async () => {
      await chatView.onOpen();
    });

    it('should show notice when no active file', async () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);
      const NoticeMock = jest.fn();
      (global as any).Notice = NoticeMock;

      await chatView.triggerFeedback();

      expect(NoticeMock).toHaveBeenCalledWith('No active file to provide feedback on');
    });

    it('should process file feedback when active file exists', async () => {
      const mockFile = {
        path: 'test.md',
        name: 'test.md',
        basename: 'test'
      };
      
      mockApp.workspace.getActiveFile.mockReturnValue(mockFile);
      mockApp.vault.read.mockResolvedValue('# Test Content');

      // Mock conversation manager
      const mockConversationManager = {
        newConversationRound: jest.fn().mockResolvedValue({
          id: 'test-turn',
          isComplete: true
        })
      };
      chatView['conversationManager'] = mockConversationManager;

      await chatView.triggerFeedback();

      expect(mockConversationManager.newConversationRound).toHaveBeenCalled();
    });

    it('should respect feedback cooldown', async () => {
      const mockFile = {
        path: 'test.md',
        name: 'test.md',
        basename: 'test'
      };
      
      mockApp.workspace.getActiveFile.mockReturnValue(mockFile);
      
      // Set recent feedback time
      chatView['lastFeedbackTimes'].set(mockFile.path, new Date());

      const NoticeMock = jest.fn();
      (global as any).Notice = NoticeMock;

      await chatView.triggerFeedback();

      expect(NoticeMock).toHaveBeenCalledWith(expect.stringContaining('cooldown'));
    });
  });

  describe('file change handling', () => {
    let mockFile: any;

    beforeEach(async () => {
      mockFile = {
        path: 'test.md',
        name: 'test.md',
        basename: 'test'
      };
      
      await chatView.onOpen();
      chatView['currentFile'] = mockFile;
    });

    it('should track file snapshots', () => {
      const oldContent = 'old content';
      const newContent = 'new content';
      
      chatView['onFileChange'](mockFile, oldContent, newContent);
      
      const snapshot = chatView['noteSnapshots'].get(mockFile.path);
      expect(snapshot).toMatchObject({
        baseline: oldContent,
        current: newContent,
        changeCount: 1
      });
    });

    it('should trigger auto-feedback when threshold reached', async () => {
      // Mock rule manager to return matching rule with auto-trigger
      const mockRule = {
        name: 'Test Rule',
        autoTrigger: true,
        feedbackThreshold: 2
      };
      
      chatView['ruleManager'] = {
        getMatchingRules: jest.fn().mockReturnValue([{ rule: mockRule }])
      };

      const triggerFeedbackSpy = jest.spyOn(chatView, 'triggerFeedback').mockResolvedValue(undefined);
      
      // Set change count to threshold
      chatView['noteSnapshots'].set(mockFile.path, {
        baseline: 'old',
        current: 'new',
        changeCount: 2
      });
      
      chatView['onFileChange'](mockFile, 'old', 'newer');
      
      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(triggerFeedbackSpy).toHaveBeenCalled();
    });

    it('should not auto-trigger when rule disabled', async () => {
      const mockRule = {
        name: 'Test Rule',
        autoTrigger: false,
        feedbackThreshold: 1
      };
      
      chatView['ruleManager'] = {
        getMatchingRules: jest.fn().mockReturnValue([{ rule: mockRule }])
      };

      const triggerFeedbackSpy = jest.spyOn(chatView, 'triggerFeedback').mockResolvedValue(undefined);
      
      chatView['onFileChange'](mockFile, 'old', 'new');
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(triggerFeedbackSpy).not.toHaveBeenCalled();
    });
  });

  describe('settings updates', () => {
    it('should update conversation manager when settings change', async () => {
      await chatView.onOpen();
      
      const mockUpdateSettings = jest.fn();
      chatView['conversationManager'] = {
        updateSettings: mockUpdateSettings
      } as any;

      const newSettings = {
        ...mockPlugin.settings,
        systemPrompt: 'Updated prompt'
      };

      chatView.updateSettings(newSettings);

      expect(mockUpdateSettings).toHaveBeenCalledWith(newSettings);
    });
  });
});