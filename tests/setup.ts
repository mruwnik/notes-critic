import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';

// Add TextEncoder/TextDecoder for JSDOM before importing JSDOM
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import { JSDOM } from 'jsdom';

// Setup JSDOM
const { window } = new JSDOM();
global.document = window.document;
global.window = window as any;

// Mock global objects
global.require = jest.fn();
global.module = { exports: {} };

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Add Obsidian methods to all DOM elements
const originalCreateElement = document.createElement.bind(document);
document.createElement = function(tagName: string, options?: ElementCreationOptions) {
  const element = originalCreateElement(tagName, options);
  
  // Add empty method like Obsidian
  (element as any).empty = jest.fn(() => {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  });
  
  // Add createEl method like Obsidian  
  (element as any).createEl = jest.fn((tag: string, attrs?: any) => {
    const el = document.createElement(tag);
    if (attrs?.cls) {
      el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
    }
    if (attrs?.text) {
      el.textContent = attrs.text;
    }
    element.appendChild(el);
    return el;
  });
  
  // Add Obsidian convenience methods
  (element as any).createDiv = jest.fn((attrs?: any) => {
    return (element as any).createEl('div', attrs);
  });
  
  (element as any).createSpan = jest.fn((attrs?: any) => {
    return (element as any).createEl('span', attrs);
  });
  
  (element as any).setText = jest.fn((text: string) => {
    element.textContent = text;
  });
  
  (element as any).addClass = jest.fn((className: string) => {
    element.classList.add(className);
  });
  
  (element as any).removeClass = jest.fn((className: string) => {
    element.classList.remove(className);
  });
  
  return element;
};