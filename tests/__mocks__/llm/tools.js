const mockExecuteCommand = jest.fn(() => Promise.resolve({ success: true }));
const mockFetchPage = jest.fn(() => Promise.resolve({ success: true, content: 'mock content' }));

const makeToolDefinition = (name, description) => ({
  name,
  description,
  parameters: {
    type: 'object',
    properties: {},
    required: []
  }
});

const browserToolDefinition = makeToolDefinition(
  'web_browser',
  'A web browser tool that will fetch a web page and return the content'
);

const textEditorToolDefinition = makeToolDefinition(
  'str_replace_based_edit_tool',
  'Mock text editor tool'
);

const memoryToolDefinition = makeToolDefinition(
  'memory',
  'Mock memory tool'
);

const createFunctionTool = (tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
});

module.exports = {
  TextEditorTool: jest.fn().mockImplementation(() => ({
    executeCommand: mockExecuteCommand
  })),
  ObsidianTextEditorTool: jest.fn().mockImplementation(() => ({
    executeCommand: mockExecuteCommand
  })),
  TextEditorCommand: jest.fn(),
  ViewCommand: jest.fn(),
  StrReplaceCommand: jest.fn(),
  CreateCommand: jest.fn(),
  InsertCommand: jest.fn(),
  textEditorToolDefinition,
  memoryToolDefinition,
  createFunctionTool,
  fetchPage: mockFetchPage,
  browserToolDefinition,
  allTools: [
    browserToolDefinition,
    textEditorToolDefinition,
    memoryToolDefinition
  ],
  // Export the mock functions for test access
  __mockExecuteCommand: mockExecuteCommand,
  __mockFetchPage: mockFetchPage
};
