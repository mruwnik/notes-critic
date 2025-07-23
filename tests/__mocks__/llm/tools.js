const mockExecuteCommand = jest.fn(() => Promise.resolve({ success: true }));

module.exports = {
  ObsidianTextEditorTool: jest.fn().mockImplementation(() => ({
    executeCommand: mockExecuteCommand
  })),
  TextEditorCommand: jest.fn(),
  textEditorToolDefinition: {
    name: 'str_replace_based_edit_tool',
    description: 'Mock text editor tool'
  },
  // Export the mock function for test access
  __mockExecuteCommand: mockExecuteCommand
};