// MarkItDown Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(tab.url).hostname;

  const aiSites = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com', 'you.com', 'poe.com', 'huggingface.co'];
  const isAiSite = aiSites.some(site => host.includes(site));

  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  if (isAiSite) {
    dot.classList.remove('off');
    text.textContent = `Active on ${host}`;
  } else {
    dot.classList.add('off');
    text.textContent = `Visit an AI chat to use`;
  }
});
