import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import NotesCritic from '../src/main';
import { DEFAULT_SETTINGS } from '../src/types';
import { CHAT_VIEW_CONFIG } from '../src/types';

// Mock the dependencies
jest.mock('../src/views/ChatView');
jest.mock('../src/settings/SettingsTab');
jest.mock('../src/llm/oauthClient');

describe('NotesCritic Plugin', () => {
  let plugin: NotesCritic;
  let mockApp: any;
  let mockWorkspace: any;
  let mockLeaf: any;

  beforeEach(() => {
    mockLeaf = {
      setViewState: jest.fn().mockResolvedValue(undefined),
      view: {
        triggerFeedback: jest.fn().mockResolvedValue(undefined),
      },
    };

    mockWorkspace = {
      getLeavesOfType: jest.fn(),
      getRightLeaf: jest.fn().mockReturnValue(mockLeaf),
      revealLeaf: jest.fn(),
    };

    mockApp = {
      workspace: mockWorkspace,
      vault: {
        adapter: {
          exists: jest.fn(),
          read: jest.fn(),
          write: jest.fn(),
        },
      },
    };

    plugin = new NotesCritic(mockApp, {} as any);
    plugin.loadData = jest.fn().mockResolvedValue({});
    plugin.saveData = jest.fn().mockResolvedValue(undefined);
    plugin.addRibbonIcon = jest.fn();
    plugin.addSettingTab = jest.fn();
    plugin.registerView = jest.fn();
    plugin.registerObsidianProtocolHandler = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onload', () => {
    it('should load settings', async () => {
      await plugin.onload();
      expect(plugin.loadData).toHaveBeenCalled();
    });

    it('should register chat view', async () => {
      await plugin.onload();
      expect(plugin.registerView).toHaveBeenCalledWith(
        CHAT_VIEW_CONFIG.type,
        expect.any(Function)
      );
    });

    it('should add ribbon icon', async () => {
      await plugin.onload();
      expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
        CHAT_VIEW_CONFIG.icon,
        CHAT_VIEW_CONFIG.name,
        expect.any(Function)
      );
    });

    it('should add settings tab', async () => {
      await plugin.onload();
      expect(plugin.addSettingTab).toHaveBeenCalled();
    });

    it('should register OAuth protocol handler', async () => {
      await plugin.onload();
      expect(plugin.registerObsidianProtocolHandler).toHaveBeenCalledWith(
        'mcp-auth-callback',
        expect.any(Function)
      );
    });
  });

  describe('activateView', () => {
    it('should use existing leaf if available', async () => {
      const existingLeaf = { ...mockLeaf };
      mockWorkspace.getLeavesOfType.mockReturnValue([existingLeaf]);

      await plugin.activateView();

      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(CHAT_VIEW_CONFIG.type);
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
      expect(mockWorkspace.getRightLeaf).not.toHaveBeenCalled();
    });

    it('should create new leaf if none exists', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);

      await plugin.activateView();

      expect(mockWorkspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({
        type: CHAT_VIEW_CONFIG.type,
        active: true,
      });
      expect(mockWorkspace.revealLeaf).toHaveBeenCalledWith(mockLeaf);
    });

    it('should handle case when getRightLeaf returns null', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      mockWorkspace.getRightLeaf.mockReturnValue(null);

      await plugin.activateView();

      expect(mockWorkspace.getRightLeaf).toHaveBeenCalled();
      expect(mockWorkspace.revealLeaf).not.toHaveBeenCalled();
    });
  });

  describe('triggerFeedbackForCurrentNote', () => {
    it('should trigger feedback on existing chat view', async () => {
      const chatView = { triggerFeedback: jest.fn().mockResolvedValue(undefined) };
      const leafWithView = { view: chatView };
      mockWorkspace.getLeavesOfType.mockReturnValue([leafWithView]);

      await plugin.triggerFeedbackForCurrentNote();

      expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith(CHAT_VIEW_CONFIG.type);
      expect(chatView.triggerFeedback).toHaveBeenCalled();
    });

    it('should show notice when no chat view is open', async () => {
      mockWorkspace.getLeavesOfType.mockReturnValue([]);
      
      // Mock Notice
      const NoticeMock = jest.fn();
      (global as any).Notice = NoticeMock;

      await plugin.triggerFeedbackForCurrentNote();

      expect(NoticeMock).toHaveBeenCalledWith('Please open the feedback view first');
    });

    it('should handle chat view without triggerFeedback method', async () => {
      const chatView = {}; // No triggerFeedback method
      const leafWithView = { view: chatView };
      mockWorkspace.getLeavesOfType.mockReturnValue([leafWithView]);

      // Should not throw an error
      await expect(plugin.triggerFeedbackForCurrentNote()).resolves.toBeUndefined();
    });
  });

  describe('settings management', () => {
    it('should load settings with defaults', async () => {
      const mockLoadData = { systemPrompt: 'Custom prompt' };
      plugin.loadData = jest.fn().mockResolvedValue(mockLoadData);

      await plugin.loadSettings();

      expect(plugin.settings).toEqual({
        ...DEFAULT_SETTINGS,
        ...mockLoadData,
      });
    });

    it('should save settings', async () => {
      plugin.settings = { ...DEFAULT_SETTINGS, systemPrompt: 'Updated prompt' };

      await plugin.saveSettings();

      expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
    });
  });

  describe('OAuth handling', () => {
    it('should handle OAuth callback during onload', async () => {
      let oauthHandler: any;
      plugin.registerObsidianProtocolHandler = jest.fn().mockImplementation((protocol, handler) => {
        oauthHandler = handler;
      });

      await plugin.onload();

      // Simulate OAuth callback
      const mockParameters = { code: 'test-code', state: 'test-state' };
      
      // Mock OAuthClient
      const mockOAuthClient = {
        exchangeCodeForToken: jest.fn().mockResolvedValue(undefined),
      };
      
      const { OAuthClient } = require('../src/llm/oauthClient');
      OAuthClient.mockImplementation(() => mockOAuthClient);

      await oauthHandler(mockParameters);

      expect(mockOAuthClient.exchangeCodeForToken).toHaveBeenCalledWith('test-code', 'test-state');
    });
  });
});