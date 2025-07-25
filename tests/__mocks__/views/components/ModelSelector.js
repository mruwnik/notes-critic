module.exports = {
  ModelSelector: jest.fn().mockImplementation(() => ({
    updateModel: jest.fn(),
    getCurrentModel: jest.fn().mockReturnValue('anthropic/claude-3-5-sonnet-latest'),
    destroy: jest.fn()
  }))
};