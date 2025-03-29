document.addEventListener('DOMContentLoaded', () => {
  // Load existing key
  chrome.storage.sync.get("geminiKey", (data) => {
    if (data.geminiKey) {
      document.getElementById('gemini-key').value = data.geminiKey;
    }
  });

  // Save key
  document.getElementById('save-btn').addEventListener('click', () => {
    const key = document.getElementById('gemini-key').value.trim();
    const status = document.getElementById('status');
    
    if (!key) {
      status.textContent = 'Please enter an API key';
      status.className = 'status error';
      return;
    }

    chrome.runtime.sendMessage({ type: "setGeminiKey", key }, (response) => {
      if (response.success) {
        status.textContent = 'Settings saved successfully!';
        status.className = 'status success';
      } else {
        status.textContent = 'Error saving settings';
        status.className = 'status error';
      }
    });
  });
});
