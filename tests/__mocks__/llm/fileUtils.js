module.exports = {
  ObsidianFileProcessor: jest.fn().mockImplementation(() => ({
    processAllFiles: jest.fn(() => Promise.resolve([]))
  }))
};