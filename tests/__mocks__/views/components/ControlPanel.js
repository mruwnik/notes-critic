module.exports = {
  ControlPanel: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    updateHistory: jest.fn()
  }))
};