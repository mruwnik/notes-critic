import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NotesCriticSettingsTab } from '../../src/settings/SettingsTab';
import { NotesCriticSettings } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/constants';

// Mock Obsidian classes
jest.mock('obsidian', () => ({
  PluginSettingTab: class PluginSettingTab {
    app: any;
    plugin: any;
    containerEl: HTMLElement;
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
    }
  },
  Setting: class Setting {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement) {
      this.containerEl = containerEl;
      this.settingEl = document.createElement('div');
      this.settingEl.className = 'setting-item';
      containerEl.appendChild(this.settingEl);
    }
    settingEl: HTMLElement;
    setName(name: string) {
      const nameEl = document.createElement('div');
      nameEl.className = 'setting-item-name';
      nameEl.textContent = name;
      this.settingEl.appendChild(nameEl);
      return this;
    }
    setDesc(desc: string) {
      const descEl = document.createElement('div');
      descEl.className = 'setting-item-description';
      descEl.textContent = desc;
      this.settingEl.appendChild(descEl);
      return this;
    }
    addText(callback: (text: any) => any) {
      const textEl = document.createElement('input');
      textEl.type = 'text';
      this.settingEl.appendChild(textEl);
      const textComponent = {
        inputEl: textEl,
        setPlaceholder: (placeholder: string) => {
          textEl.placeholder = placeholder;
          return textComponent;
        },
        setValue: (value: string) => {
          textEl.value = value;
          return textComponent;
        },
        onChange: (callback: (value: string) => void) => {
          textEl.addEventListener('input', () => callback(textEl.value));
          return textComponent;
        }
      };
      callback(textComponent);
      return this;
    }
    addDropdown(callback: (dropdown: any) => any) {
      const selectEl = document.createElement('select');
      this.settingEl.appendChild(selectEl);
      const dropdownComponent = {
        selectEl,
        addOption: (value: string, text: string) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          selectEl.appendChild(option);
          return dropdownComponent;
        },
        setValue: (value: string) => {
          selectEl.value = value;
          return dropdownComponent;
        },
        onChange: (callback: (value: string) => void) => {
          selectEl.addEventListener('change', () => callback(selectEl.value));
          return dropdownComponent;
        }
      };
      callback(dropdownComponent);
      return this;
    }
    addToggle(callback: (toggle: any) => any) {
      const toggleEl = document.createElement('input');
      toggleEl.type = 'checkbox';
      this.settingEl.appendChild(toggleEl);
      const toggleComponent = {
        toggleEl,
        setValue: (value: boolean) => {
          toggleEl.checked = value;
          return toggleComponent;
        },
        onChange: (callback: (value: boolean) => void) => {
          toggleEl.addEventListener('change', () => callback(toggleEl.checked));
          return toggleComponent;
        }
      };
      callback(toggleComponent);
      return this;
    }
    addButton(callback: (button: any) => any) {
      const buttonEl = document.createElement('button');
      this.settingEl.appendChild(buttonEl);
      const buttonComponent = {
        buttonEl,
        setButtonText: (text: string) => {
          buttonEl.textContent = text;
          return buttonComponent;
        },
        setTooltip: (tooltip: string) => {
          buttonEl.title = tooltip;
          return buttonComponent;
        },
        setClass: (className: string) => {
          buttonEl.className = className;
          return buttonComponent;
        },
        setDisabled: (disabled: boolean) => {
          buttonEl.disabled = disabled;
          return buttonComponent;
        },
        onClick: (callback: () => void) => {
          buttonEl.addEventListener('click', callback);
          return buttonComponent;
        }
      };
      callback(buttonComponent);
      return this;
    }
  }
}));

// Mock dependencies  
jest.mock('llm/llmProvider', () => ({
  LLMProvider: {
    testApiKey: jest.fn()
  }
}));
jest.mock('../../src/llm/mcpClient');
jest.mock('../../src/llm/oauthClient');
jest.mock('../../src/settings/components/RulesSettingsComponent');

jest.mock('settings/components/MCPSettingsComponent', () => ({
  MCPSettingsComponent: class MCPSettingsComponent {
    constructor(app: any, container: HTMLElement, plugin: any) {
      // Create some toggle elements for testing
      const toggle1 = document.createElement('input');
      toggle1.type = 'checkbox';
      toggle1.className = 'mcp-toggle';
      toggle1.addEventListener('change', async () => {
        await plugin.saveSettings();
      });
      container.appendChild(toggle1);
      
      const toggle2 = document.createElement('input');
      toggle2.type = 'checkbox';
      toggle2.className = 'mcp-toggle';
      toggle2.addEventListener('change', async () => {
        await plugin.saveSettings();
      });
      container.appendChild(toggle2);
    }
    async render() {
      // Mock render method
    }
  }
}));

jest.mock('settings/components/ToolsSettingsComponent', () => ({
  ToolsSettingsComponent: class ToolsSettingsComponent {
    constructor(app: any, container: HTMLElement, plugin: any) {
      // Create some toggle elements for tools testing
      const toggle1 = document.createElement('input');
      toggle1.type = 'checkbox';
      toggle1.className = 'tool-toggle';
      toggle1.addEventListener('change', async () => {
        await plugin.saveSettings();
      });
      container.appendChild(toggle1);
      
      const toggle2 = document.createElement('input');
      toggle2.type = 'checkbox';
      toggle2.className = 'tool-toggle';
      toggle2.addEventListener('change', async () => {
        await plugin.saveSettings();
      });
      container.appendChild(toggle2);
    }
    async render() {
      // Mock render method
    }
  }
}));

jest.mock('views/components/ModelSelector', () => ({
  ModelSelector: class ModelSelector {
    constructor(parent: HTMLElement, plugin: any, title: string = "Model", desc: string = "AI model for feedback", modelKind: 'model' | 'summarizer' = 'model') {
      // Create the setting structure that ModelSelector would create
      const settingDiv = document.createElement('div');
      settingDiv.className = 'setting-item notes-critic-model-selector';
      
      const infoDiv = document.createElement('div');
      infoDiv.className = 'setting-item-info';
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'setting-item-name';
      nameDiv.textContent = title;
      infoDiv.appendChild(nameDiv);
      
      const descDiv = document.createElement('div');
      descDiv.className = 'setting-item-description';
      descDiv.textContent = desc;
      infoDiv.appendChild(descDiv);
      
      const controlDiv = document.createElement('div');
      controlDiv.className = 'setting-item-control';
      
      const select = document.createElement('select');
      select.className = 'dropdown';
      
      const option1 = document.createElement('option');
      option1.value = 'anthropic/claude-3-5-sonnet-latest';
      option1.textContent = 'Claude 3.5 Sonnet';
      select.appendChild(option1);
      
      const option2 = document.createElement('option');
      option2.value = 'openai/gpt-4o';
      option2.textContent = 'GPT-4o';
      select.appendChild(option2);
      
      // Set initial value based on current settings
      const fieldName = modelKind === 'model' ? 'model' : 'summarizerModel';
      const currentValue = plugin.settings[fieldName];
      if (currentValue) {
        select.value = currentValue;
      }
      
      // Add onChange handler to update settings
      select.addEventListener('change', async () => {
        if (modelKind === 'model') {
          plugin.settings.model = select.value;
        } else {
          plugin.settings.summarizerModel = select.value;
        }
        await plugin.saveSettings();
      });
      
      controlDiv.appendChild(select);
      settingDiv.appendChild(infoDiv);
      settingDiv.appendChild(controlDiv);
      parent.appendChild(settingDiv);
    }
  }
}));

describe('NotesCriticSettingsTab', () => {
  let settingsTab: NotesCriticSettingsTab;
  let mockApp: any;
  let mockPlugin: any;
  let mockSettings: NotesCriticSettings;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    mockApp = {
      workspace: { getActiveFile: jest.fn() }
    };

    mockSettings = { ...DEFAULT_SETTINGS };
    
    mockPlugin = {
      settings: mockSettings,
      saveSettings: jest.fn().mockResolvedValue(undefined),
      app: mockApp
    };

    settingsTab = new NotesCriticSettingsTab(mockApp, mockPlugin);
    
    // The mock PluginSettingTab will create its own containerEl
    mockContainer = settingsTab.containerEl;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockContainer.innerHTML = '';
  });

  describe('display', () => {
    it('should create UI elements when displayed', () => {
      settingsTab.display();
      
      // Check that settings sections are created
      const sections = mockContainer.querySelectorAll('h3.notes-critic-settings-section');
      expect(sections.length).toBeGreaterThan(0);
      
      // Check that some settings controls are created
      const settingsControls = mockContainer.querySelectorAll('.setting-item');
      expect(settingsControls.length).toBeGreaterThan(0);
    });

    it('should clear container before displaying', () => {
      mockContainer.innerHTML = '<div>Previous content</div>';
      
      settingsTab.display();
      
      expect(mockContainer.innerHTML).not.toContain('Previous content');
    });

    it('should create API key settings with password inputs', () => {
      settingsTab.display();
      
      const passwordInputs = mockContainer.querySelectorAll('input[type="password"]');
      expect(passwordInputs.length).toBeGreaterThan(0);
    });

    it('should create model dropdown setting', async () => {
      await settingsTab.display();
      
      const dropdowns = mockContainer.querySelectorAll('select');
      expect(dropdowns.length).toBeGreaterThan(0);
    });

    it('should create text area for prompts', () => {
      settingsTab.display();
      
      const textAreas = mockContainer.querySelectorAll('textarea');
      expect(textAreas.length).toBeGreaterThan(0);
    });

    it('should create toggle settings', () => {
      settingsTab.display();
      
      const toggles = mockContainer.querySelectorAll('input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThan(0);
    });
  });

  describe('setting updates', () => {
    beforeEach(() => {
      settingsTab.display();
    });

    it('should update settings when text inputs change', async () => {
      const systemPromptTextarea = mockContainer.querySelector('textarea') as HTMLTextAreaElement;
      expect(systemPromptTextarea).toBeTruthy();
      
      const newPrompt = 'Updated system prompt';
      systemPromptTextarea.value = newPrompt;
      systemPromptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Allow async update to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockPlugin.settings.systemPrompt).toBe(newPrompt);
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should update API keys when password inputs change', async () => {
      const apiKeyInputs = mockContainer.querySelectorAll('input[type="password"]') as NodeListOf<HTMLInputElement>;
      expect(apiKeyInputs.length).toBeGreaterThan(0);
      
      const firstApiKeyInput = apiKeyInputs[0];
      const newApiKey = 'new-api-key-123';
      firstApiKeyInput.value = newApiKey;
      firstApiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('should update numeric settings', async () => {
      // Find a number input (like maxTokens)
      const numberInputs = mockContainer.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
      
      // Look for input that might be for maxTokens
      let maxTokensInput: HTMLInputElement | null = null;
      for (const input of numberInputs) {
        const settingItem = input.closest('.setting-item');
        if (settingItem?.textContent?.includes('Max Tokens') || settingItem?.textContent?.includes('tokens')) {
          maxTokensInput = input;
          break;
        }
      }
      
      if (maxTokensInput) {
        const newValue = '3000';
        maxTokensInput.value = newValue;
        maxTokensInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should update toggle settings', async () => {
      const toggleInputs = mockContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
      
      if (toggleInputs.length > 0) {
        const firstToggle = toggleInputs[0];
        const originalValue = firstToggle.checked;
        
        firstToggle.checked = !originalValue;
        firstToggle.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should update model dropdown', async () => {
      const dropdowns = mockContainer.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
      
      if (dropdowns.length > 0) {
        const modelDropdown = dropdowns[0];
        const originalValue = modelDropdown.value;
        
        // Change to a different option
        const options = Array.from(modelDropdown.options);
        const differentOption = options.find(opt => opt.value !== originalValue);
        
        if (differentOption) {
          modelDropdown.value = differentOption.value;
          modelDropdown.dispatchEvent(new Event('change', { bubbles: true }));
          
          await new Promise(resolve => setTimeout(resolve, 0));
          
          expect(mockPlugin.settings.model).toBe(differentOption.value);
          expect(mockPlugin.saveSettings).toHaveBeenCalled();
        }
      }
    });
  });

  describe('API key testing', () => {
    it('should create API key test buttons', () => {
      settingsTab.display();
      
      const buttons = mockContainer.querySelectorAll('button');
      const testButtons = Array.from(buttons).filter(btn => 
        btn.textContent?.toLowerCase().includes('test') ||
        btn.textContent?.toLowerCase().includes('verify')
      );
      
      expect(testButtons.length).toBeGreaterThan(0);
    });

    it('should handle successful API key test', async () => {
      const { LLMProvider } = await import('llm/llmProvider');
      const testApiKeyMock = LLMProvider.testApiKey as jest.Mock;
      testApiKeyMock.mockResolvedValue(true);
      
      await settingsTab.display();
      
      // Find and click test button
      const buttons = mockContainer.querySelectorAll('button');
      const testButton = Array.from(buttons).find(btn => 
        btn.textContent?.toLowerCase().includes('test')
      ) as HTMLElement;
      
      if (testButton) {
        testButton.click();
        
        // Allow async operation to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(testApiKeyMock).toHaveBeenCalled();
      } else {
        throw new Error('Test button not found');
      }
    });

    it('should handle failed API key test', async () => {
      const { LLMProvider } = await import('llm/llmProvider');
      const testApiKeyMock = LLMProvider.testApiKey as jest.Mock;
      testApiKeyMock.mockResolvedValue(false);
      
      await settingsTab.display();
      
      const buttons = mockContainer.querySelectorAll('button');
      const testButton = Array.from(buttons).find(btn => 
        btn.textContent?.toLowerCase().includes('test')
      );
      
      if (testButton) {
        testButton.click();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        expect(testApiKeyMock).toHaveBeenCalled();
      }
    });
  });

  describe('settings validation', () => {
    it('should handle invalid numeric inputs gracefully', async () => {
      settingsTab.display();
      
      const numberInputs = mockContainer.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
      
      if (numberInputs.length > 0) {
        const firstInput = numberInputs[0];
        firstInput.value = 'invalid-number';
        firstInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Should not crash and settings should remain valid
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      }
    });

    it('should preserve original settings structure', () => {
      const originalKeys = Object.keys(mockSettings);
      
      settingsTab.display();
      
      const currentKeys = Object.keys(mockPlugin.settings);
      expect(currentKeys).toEqual(expect.arrayContaining(originalKeys));
    });
  });
});