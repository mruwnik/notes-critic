// Mock ChatView
class MockChatView {
  constructor(leaf, plugin) {
    this.leaf = leaf;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }

  getViewType() {
    return 'notes-critic-chat';
  }

  getDisplayText() {
    return 'Notes Critic Chat';
  }

  getIcon() {
    return 'message-square';
  }

  onOpen() {
    return Promise.resolve();
  }

  onClose() {
    return Promise.resolve();
  }

  async sendMessage(message) {
    return Promise.resolve();
  }

  destroy() {}
}

module.exports = {
  ChatView: MockChatView
};