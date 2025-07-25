const mockExecuteCommand = jest.fn(() => Promise.resolve({ success: true }));
const mockFetchPage = jest.fn(() => Promise.resolve({ success: true, content: 'mock content' }));

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
  textEditorToolDefinition: {
    name: 'str_replace_based_edit_tool',
    description: 'Mock text editor tool'
  },
  fetchPage: mockFetchPage,
  browserToolDefinition: {
    name: 'web_browser',
    description: 'A web browser tool that will fetch a web page and return the content'
  },
  allTools: [
    {
      name: 'web_browser',
      description: 'A web browser tool that will fetch a web page and return the content'
    },
    {
      name: 'str_replace_based_edit_tool',
      description: 'Mock text editor tool'
    }
  ],
  // Export the mock functions for test access
  __mockExecuteCommand: mockExecuteCommand,
  __mockFetchPage: mockFetchPage
};