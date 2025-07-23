module.exports = {
  ChatInput: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
};