module.exports = {
  MCPSettingsComponent: jest.fn().mockImplementation(() => ({
    display: jest.fn(),
    render: jest.fn(),
    destroy: jest.fn()
  }))
};