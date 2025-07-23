module.exports = {
  NotesCriticSettingsTab: jest.fn().mockImplementation(() => ({
    display: jest.fn(),
    hide: jest.fn(),
    containerEl: {
      empty: jest.fn(),
      createEl: jest.fn(),
      createDiv: jest.fn()
    }
  }))
};