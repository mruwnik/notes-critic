module.exports = {
  ControlPanel: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
};