// MarkItDown Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('MarkItDown installed!');
  chrome.storage.local.set({ enabled: true });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getStatus') {
    chrome.storage.local.get('enabled', (data) => {
      sendResponse({ enabled: data.enabled !== false });
    });
    return true;
  }
  if (msg.type === 'toggle') {
    chrome.storage.local.get('enabled', (data) => {
      chrome.storage.local.set({ enabled: !data.enabled });
      sendResponse({ enabled: !data.enabled });
    });
    return true;
  }
});
