// Add logging utility
const log = {
  info: (message, data) => {
    console.log(`[Popup] 📘 ${message}`, data || '');
  },
  error: (message, error) => {
    console.error(`[Popup] ❌ ${message}`, error);
  },
  success: (message, data) => {
    console.log(`[Popup] ✅ ${message}`, data || '');
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
  log.info('Popup initialized');
  const apiConfig = document.getElementById('api-config');
  const error = document.getElementById('error');
  const refreshBtn = document.getElementById('refreshSummary');
  const apiKey = document.getElementById('apiKey');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const saveApiKey = document.getElementById('saveApiKey');
  const apiStatus = document.getElementById('apiStatus');

  // Check if API key is configured
  log.info('Checking for API key');
  const result = await chrome.storage.local.get(['geminiApiKey']);
  if (!result.geminiApiKey) {
    log.info('No API key found, showing configuration panel');
    apiConfig.classList.remove('hidden');
    refreshBtn.classList.add('hidden');
  } else {
    log.success('API key found');
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
      log.error('Empty API key provided');
      apiStatus.textContent = 'Please enter an API key';
      apiStatus.className = 'status error';
      return;
    }

    log.info('Validating API key');
    apiStatus.textContent = 'Validating API key...';
    apiStatus.className = 'status';
    saveApiKey.disabled = true;

    try {
      log.info('Testing API key with Gemini endpoint');
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

      log.success('API key validated successfully');
      await chrome.storage.local.set({ geminiApiKey: key });
      apiStatus.textContent = 'API key saved successfully!';
      apiStatus.className = 'status success';
      
      // Show refresh button and hide API config after short delay
      setTimeout(() => {
        apiConfig.classList.add('hidden');
        refreshBtn.classList.remove('hidden');
      }, 1500);
    } catch (error) {
      log.error('API key validation failed:', error);
      apiStatus.textContent = `Error: ${error.message}`;
      apiStatus.className = 'status error';
    } finally {
      saveApiKey.disabled = false;
    }
  });

  // Refresh button click handler
  refreshBtn.addEventListener('click', async () => {
    log.info('Refresh button clicked');
    refreshBtn.disabled = true;
    error.classList.add('hidden');

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

      // Send refresh message to content script
      log.info('Sending refresh message to content script');
      await chrome.tabs.sendMessage(tab.id, { action: 'refresh' });
      log.success('Refresh message sent');
      
      // Close the popup
      window.close();
    } catch (err) {
      log.error('Refresh failed:', err);
      error.querySelector('.error-message').textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      refreshBtn.disabled = false;
    }
  });
}); 