chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Chatbot extension installed.");
  // Check for existing key on installation
  chrome.storage.sync.get("geminiKey", (data) => {
    console.log("Initial key status:", data.geminiKey ? "Key exists" : "Key missing");
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "setGeminiKey") {
    chrome.storage.sync.set({ geminiKey: message.key }, () => {
      console.log("Key saved in storage");
      sendResponse({ success: true });
    });
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === "getGeminiKey") {
    chrome.storage.sync.get("geminiKey", (data) => {
      console.log("Retrieving key from storage");
      sendResponse({ key: data.geminiKey });
    });
    return true; // Keep the message channel open for async response
  }
});
