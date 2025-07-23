module.exports = {
  OAuthClient: jest.fn().mockImplementation(() => ({
    exchangeCodeForToken: jest.fn(() => Promise.resolve())
  }))
};