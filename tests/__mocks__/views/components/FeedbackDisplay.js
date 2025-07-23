module.exports = {
  FeedbackDisplay: jest.fn().mockImplementation(() => ({
    redisplayConversation: jest.fn(),
    handleConversationChunk: jest.fn(),
    destroy: jest.fn()
  }))
};