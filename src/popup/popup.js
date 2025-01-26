// Add logging utility
const log = {
  info: (message, data) => {
    console.log(`[Transcript Summarizer] 📘 ${message}`, data || '');
  },
  error: (message, error) => {
    console.error(`[Transcript Summarizer] ❌ ${message}`, error);
  },
  success: (message, data) => {
    console.log(`[Transcript Summarizer] ✅ ${message}`, data || '');
  }
};

// Simple HTML sanitizer that only allows specific tags
function sanitizeHTML(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Only allow specific HTML tags and their content
  const allowedTags = ['h3', 'p', 'ul', 'li', 'b'];
  
  // Recursively process nodes
  function processNode(node) {
    // Create a copy of childNodes as it will be modified during iteration
    const children = Array.from(node.childNodes);
    
    children.forEach(child => {
      if (child.nodeType === 1) { // Element node
        if (!allowedTags.includes(child.tagName.toLowerCase())) {
          // Create a text node with the child's text content
          const text = document.createTextNode(child.textContent);
          node.replaceChild(text, child);
        } else {
          // Recursively process allowed tags
          processNode(child);
        }
      }
    });
  }
  
  processNode(temp);
  return temp.innerHTML;
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    log.success('Content script injected successfully');
  } catch (err) {
    log.error('Failed to inject content script:', err);
    throw new Error('Failed to initialize transcript fetcher');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const apiConfig = document.getElementById('api-config');
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const summary = document.getElementById('summary');
  const summarizeBtn = document.getElementById('summarize');
  const summaryText = document.getElementById('summary-text');
  const apiKey = document.getElementById('apiKey');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const saveApiKey = document.getElementById('saveApiKey');
  const apiStatus = document.getElementById('apiStatus');

  // Check if API key is configured
  const result = await chrome.storage.local.get(['geminiApiKey']);
  if (!result.geminiApiKey) {
    apiConfig.classList.remove('hidden');
    summarizeBtn.classList.add('hidden');
  }

  // Toggle API key visibility
  toggleVisibility.addEventListener('click', () => {
    if (apiKey.type === 'password') {
      apiKey.type = 'text';
      toggleVisibility.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
      apiKey.type = 'password';
      toggleVisibility.innerHTML = '<i class="fas fa-eye"></i>';
    }
  });

  // Save API key
  saveApiKey.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) {
      apiStatus.textContent = 'Please enter an API key';
      apiStatus.className = 'status error';
      return;
    }

    apiStatus.textContent = 'Validating API key...';
    apiStatus.className = 'status';
    saveApiKey.disabled = true;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Hello'
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      await chrome.storage.local.set({ geminiApiKey: key });
      apiStatus.textContent = 'API key saved successfully!';
      apiStatus.className = 'status success';
      
      // Show summarize button and hide API config after short delay
      setTimeout(() => {
        apiConfig.classList.add('hidden');
        summarizeBtn.classList.remove('hidden');
      }, 1500);
    } catch (error) {
      apiStatus.textContent = `Error: ${error.message}`;
      apiStatus.className = 'status error';
    } finally {
      saveApiKey.disabled = false;
    }
  });

  // Summarize button click handler
  summarizeBtn.addEventListener('click', async () => {
    log.info('Summarize button clicked');
    // Hide any previous content
    summary.classList.add('hidden');
    error.classList.add('hidden');
    
    // Show loading
    loading.classList.remove('hidden');
    summarizeBtn.disabled = true;

    try {
      // Get current tab
      log.info('Getting current tab');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Check if we're on a YouTube video page
      if (!tab.url?.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video page');
      }

      // Inject content script if not already injected
      log.info('Ensuring content script is injected');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [
            'lib/purify.min.js',
            'content/content.js'
          ]
        });
        log.success('Content script injected or already exists');
      } catch (err) {
        // If error is about script already existing, we can proceed
        if (!err.message?.includes('already exists')) {
          throw err;
        }
      }

      // Send summarize message to content script
      log.info('Requesting summarization');
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'summarize' });
      
      if (response.error) {
        throw new Error(response.error);
      }

      log.success('Summarization completed');
      // Close the popup since summary will be shown on the page
      window.close();
    } catch (err) {
      log.error('Summarization failed:', err);
      // If error is about API key not being configured, show API config
      if (err.message.includes('API key not configured')) {
        apiConfig.classList.remove('hidden');
        summarizeBtn.classList.add('hidden');
      } else {
        error.querySelector('.error-message').textContent = err.message;
        error.classList.remove('hidden');
      }
    } finally {
      loading.classList.add('hidden');
      summarizeBtn.disabled = false;
    }
  });
}); 