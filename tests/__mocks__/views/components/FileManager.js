module.exports = {
  FileManager: jest.fn().mockImplementation(() => ({
    getCurrentFile: jest.fn(),
    initializeFileSnapshot: jest.fn(),
    updateFileSnapshot: jest.fn(),
    updateFeedbackBaseline: jest.fn(),
    clearNoteData: jest.fn()
  }))
};