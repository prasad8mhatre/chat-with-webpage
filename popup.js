document.addEventListener('DOMContentLoaded', () => {
  // Initialize marked with options
  marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false
  });

  // Initialize highlight.js
  hljs.configure({
    ignoreUnescapedHTML: true
  });
});

// Initialize marked configuration
marked.setOptions({
  gfm: true,
  breaks: true,
  sanitize: false,
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {}
    }
    return code;
  }
});

document.getElementById("settings-icon").addEventListener("click", () => {
  chrome.runtime.openOptionsPage((result) => {
    if (chrome.runtime.lastError) {
      console.error("Error opening options page:", chrome.runtime.lastError.message);
    }
  });
});

document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const query = e.target.value.trim();
    if (!query) return; // Ignore empty input
    e.target.value = "";

    const chatOutput = document.getElementById("chat-output");
    // Append user message to the chat output
    chatOutput.innerHTML += `<div class="user-message">${query}</div>`;

    // Retrieve the Gemini API key from background.js
    chrome.runtime.sendMessage({ type: "getGeminiKey" }, (response) => {
      console.log("Key retrieval response:", response);
      const geminiKey = response?.key;

      if (!geminiKey) {
        console.error("No Gemini key found");
        chatOutput.innerHTML += `<div class="bot-message">Please configure your Gemini API key in settings first. Click the gear icon ⚙️ to open settings.</div>`;
        return;
      }

      // First get the page content
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        try {
          if (!tabs[0]?.id) {
            throw new Error('No active tab found');
          }

          const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              return new Promise((resolve) => {
                console.log("Starting content extraction");

                // Check if this is a PDF file
                const isPDF = document.querySelector('embed[type="application/pdf"]') || 
                            document.querySelector('object[type="application/pdf"]') ||
                            location.pathname.toLowerCase().endsWith('.pdf');

                if (isPDF) {
                  // Handle PDF content
                  const pdfViewer = document.querySelector('#viewer');
                  if (pdfViewer) {
                    const textLayers = Array.from(pdfViewer.querySelectorAll('.textLayer'));
                    const pdfContent = textLayers
                      .map(layer => layer.textContent)
                      .join('\n')
                      .trim();
                    
                    if (pdfContent) {
                      resolve({ content: pdfContent, type: 'pdf' });
                      return;
                    }
                  }
                }

                // Handle regular webpage content
                function getVisibleText(node) {
                  let text = '';
                  
                  // Check if node is a text node
                  if (node.nodeType === Node.TEXT_NODE) {
                    text = node.textContent.trim();
                  } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Skip hidden elements
                    const style = window.getComputedStyle(node);
                    if (style.display === 'none' || style.visibility === 'hidden' || 
                        ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) {
                      return '';
                    }
                    
                    // Process child nodes
                    for (const child of node.childNodes) {
                      text += ' ' + getVisibleText(child);
                    }
                  }
                  
                  return text.trim();
                }

                const content = getVisibleText(document.body);
                console.log("Extracted content length:", content.length);
                
                if (!content || content.length < 10) {
                  resolve({ error: 'No meaningful content found' });
                } else {
                  resolve({ content: content, type: 'webpage' });
                }
              });
            }
          });

          const extractedData = results?.[0]?.result;
          console.log("Extraction result:", extractedData);

          if (extractedData?.error) {
            throw new Error(extractedData.error);
          }

          const pageContent = extractedData?.content;
          const contentType = extractedData?.type || 'webpage';
          
          if (!pageContent) {
            throw new Error('Content extraction failed');
          }

          // Update prompt with content type context
          const prompt = `You are an AI assistant that helps users understand ${contentType} content. 
Format your response in a clear and natural way:
1. Answer the question based on the ${contentType} content
2. Each statement must be followed by a direct quote from the source as evidence
3. Format citations as: Statement [Source: "exact quote from ${contentType}"]
4. If you can't find relevant information, say "I don't know"

User question: ${query}

Content from ${contentType}:
${pageContent.slice(0, 5000)}`;

          fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              "contents": [{
                "parts": [{ "text": prompt }]
              }]
            })
          })
          .then(res => res.json())
          .then(data => {
            const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
            try {
              // Process citations first
              const processedResponse = responseText.replace(
                /\[Source: "(.*?)"\]/g,
                (match, quote) => `<span class="citation-wrapper">
                  <span class="citation-icon">@</span>
                  <span class="citation-text">${quote}</span>
                </span>`
              );
              
              // Convert to HTML and sanitize
              const htmlContent = DOMPurify.sanitize(marked.parse(processedResponse));
              chatOutput.innerHTML += `<div class="bot-message markdown-body">${htmlContent}</div>`;
            } catch (err) {
              console.error("Response processing error:", err);
              chatOutput.innerHTML += `<div class="bot-message">${responseText}</div>`;
            }
          })
          .catch(error => {
            console.error("Error:", error);
            chatOutput.innerHTML += `<div class="bot-message">An error occurred while fetching the response.</div>`;
          });
        } catch (error) {
          console.error("Error during content extraction:", error);
          chatOutput.innerHTML += `<div class="bot-message">${error.message}</div>`;
        }
      });
    });
  }
});
