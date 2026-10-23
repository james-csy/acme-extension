// Content scripts can't open the extension's options page themselves; the panel asks here.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'open-options') chrome.runtime.openOptionsPage();
});
