// Mock implementation of Obsidian API
const mockWorkspace = {
  getLeavesOfType: jest.fn(() => []),
  getRightLeaf: jest.fn(() => ({
    setViewState: jest.fn(),
  })),
  revealLeaf: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  getActiveFile: jest.fn(),
};

const mockApp = {
  workspace: mockWorkspace,
  vault: {
    adapter: {
      exists: jest.fn(),
      read: jest.fn(),
      write: jest.fn(),
      list: jest.fn(() => ({ files: [], folders: [] })),
    },
    getActiveFile: jest.fn(),
    read: jest.fn(),
    modify: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    create: jest.fn(),
    readBinary: jest.fn(),
    getFiles: jest.fn(() => []),
  },
  metadataCache: {
    getFileCache: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
};

module.exports = {
  Plugin: class Plugin {
    constructor(app, manifest) {
      this.app = app || mockApp;
      this.manifest = manifest;
      this.settings = {};
    }
    addRibbonIcon = jest.fn();
    addSettingTab = jest.fn();
    registerView = jest.fn();
    registerObsidianProtocolHandler = jest.fn();
    loadData = jest.fn(() => Promise.resolve({}));
    saveData = jest.fn(() => Promise.resolve());
    registerEvent = jest.fn();
  },
  
  Notice: jest.fn(),
  
  TFile: class TFile {
    constructor(path) {
      this.path = path || '';
      this.name = path ? path.split('/').pop() : '';
      this.basename = this.name?.replace(/\.[^/.]+$/, '') || '';
    }
  },
  
  WorkspaceLeaf: class WorkspaceLeaf {
    constructor() {
      this.detach = jest.fn();
      this.view = null;
    }
  },
  
  ItemView: class ItemView {
    constructor(leaf) {
      // Create a container div with empty method
      const containerDiv = document.createElement('div');
      containerDiv.empty = jest.fn(() => {
        while (containerDiv.firstChild) {
          containerDiv.removeChild(containerDiv.firstChild);
        }
      });
      
      this.containerEl = {
        children: [null, containerDiv],
        createEl: (tag, attrs) => {
          const el = document.createElement(tag);
          if (attrs?.cls) {
            el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
          }
          if (attrs?.text) {
            el.textContent = attrs.text;
          }
          // Add empty method to created elements
          el.empty = jest.fn(() => {
            while (el.firstChild) {
              el.removeChild(el.firstChild);
            }
          });
          return el;
        }
      };
      this.app = mockApp;
      this.leaf = leaf || { detach: jest.fn() };
    }
    registerEvent = jest.fn();
  },
  
  Setting: class Setting {
    constructor(containerEl) {
      this.containerEl = containerEl;
      return this;
    }
    setName = jest.fn().mockReturnThis();
    setDesc = jest.fn().mockReturnThis();
    addText = jest.fn().mockReturnThis();
    addTextArea = jest.fn().mockReturnThis();
    addToggle = jest.fn().mockReturnThis();
    addDropdown = jest.fn().mockReturnThis();
    addButton = jest.fn().mockReturnThis();
    setValue = jest.fn().mockReturnThis();
    onChange = jest.fn().mockReturnThis();
  },
  
  PluginSettingTab: class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app || mockApp;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
      this.containerEl.empty = jest.fn();
      this.containerEl.createEl = (tag, attrs) => {
        const el = document.createElement(tag);
        if (attrs?.cls) {
          el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
        }
        if (attrs?.text) {
          el.textContent = attrs.text;
        }
        this.containerEl.appendChild(el);
        return el;
      };
    }
    display() {
      this.containerEl.empty();
    }
  },

  requestUrl: jest.fn(() => Promise.resolve({ 
    status: 200, 
    json: {},
    text: () => Promise.resolve('{}')
  })),

  normalizePath: jest.fn(path => path),

  // Export the mock app for use in tests
  __mockApp: mockApp
};