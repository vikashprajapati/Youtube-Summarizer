// Add logging utility
const log = {
  info: (message, data) => {
    console.log(`[Content Script] 📘 ${message}`, data || '');
  },
  error: (message, error) => {
    console.error(`[Content Script] ❌ ${message}`, error);
  },
  success: (message, data) => {
    console.log(`[Content Script] ✅ ${message}`, data || '');
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    log.info('Received request for transcript');
    getYouTubeTranscript()
      .then(transcript => {
        log.success('Successfully extracted transcript', { length: transcript.length });
        sendResponse({ transcript });
      })
      .catch(error => {
        log.error('Failed to get transcript:', error);
        sendResponse({ error: error.message });
      });
    return true; // Required for async response
  } else if (request.action === 'refresh') {
    log.info('Received refresh request');
    initialize()
      .then(() => {
        log.success('Refresh completed successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        log.error('Refresh failed:', error);
        sendResponse({ error: error.message });
      });
    return true; // Required for async response
  }
});

async function getYouTubeTranscript() {
  try {
    log.info('Starting transcript extraction');
    // First, check if transcript panel is already open
    let transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');
    
    if (!transcriptPanel) {
      log.info('Transcript panel not open, looking for button');
      // Find the "Show transcript" button using the specific class
      const showTranscriptButton = document.querySelector(
        'button.yt-spec-button-shape-next--outline[aria-label="Show transcript"]'
      );
      
      if (!showTranscriptButton) {
        throw new Error('Could not find Show Transcript button. Please ensure video has transcripts available.');
      }

      log.info('Found transcript button, clicking it');
      // Click the button and wait for panel to appear
      showTranscriptButton.click();
      
      // Wait for the transcript panel to appear using waitForElement
      log.info('Waiting for transcript panel to load...');
      try {
        transcriptPanel = await waitForElement('ytd-transcript-segment-list-renderer', 5000);
        log.success('Transcript panel loaded successfully');
      } catch (error) {
        throw new Error('Failed to load transcript panel after clicking button. Try refreshing the page.');
      }
    }

    // Wait a short moment for the segments to be populated
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get all transcript segments
    const segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) {
      // If no segments found immediately, wait a bit longer and try again
      log.info('No segments found, waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
      if (!segments.length) {
        throw new Error('No transcript segments found. The video might not have a transcript available.');
      }
    }
    log.info('Found transcript segments', { count: segments.length });

    // Extract and combine text from all segments
    let transcript = '';
    segments.forEach(segment => {
      const textElement = segment.querySelector('.segment-text');
      if (textElement) {
        transcript += textElement.textContent.trim() + ' ';
      }
    });

    if (!transcript.trim()) {
      throw new Error('Failed to extract transcript text. The transcript might be empty.');
    }

    log.success('Transcript extracted successfully', {
      length: transcript.length,
      preview: transcript.slice(0, 100) + '...'
    });

    return transcript.trim();
  } catch (error) {
    log.error('Transcript extraction failed:', error);
    throw new Error(`Failed to get transcript: ${error.message}`);
  }
}

// Add Font Awesome to the page
function addFontAwesome() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  document.head.appendChild(link);
}

// Create and inject summary panel
function createSummaryPanel() {
  const panel = document.createElement('div');
  panel.id = 'yt-summary-panel';
  panel.innerHTML = `
    <div class="header">
      <i class="fas fa-robot"></i>
      <h3>AI Summary</h3>
    </div>
    <div class="content">
      <div class="loading">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>Generating summary...</span>
      </div>
    </div>
  `;
  return panel;
}

// Update panel content
function updatePanelContent(content, isError = false) {
  const contentDiv = document.querySelector('#yt-summary-panel .content');
  if (!contentDiv) return;

  if (isError) {
    contentDiv.innerHTML = `
      <div class="error">
        <i class="fas fa-exclamation-circle"></i>
        <span>${content}</span>
      </div>
    `;
  } else {
    contentDiv.innerHTML = sanitizeHTML(content);
  }
}

// Wait for elements to be present in DOM
async function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkElement() {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timeout waiting for ${selector}`));
        return;
      }
      
      requestAnimationFrame(checkElement);
    }
    
    checkElement();
  });
}

// Main initialization function
async function initialize() {
  try {
    log.info('Starting initialization');
    // Add Font Awesome
    addFontAwesome();
    
    // Wait for the secondary column
    const secondaryColumn = await waitForElement('#secondary');
    log.info('Found secondary column');
    
    // Create and inject panel
    const panel = createSummaryPanel();
    secondaryColumn.insertBefore(panel, secondaryColumn.firstChild);
    log.success('Injected summary panel');

    // Wait for transcript button to appear
    log.info('Waiting for transcript button...');
    await waitForElement('button.yt-spec-button-shape-next--outline[aria-label="Show transcript"]');
    log.success('Transcript button found');

    // Start transcript extraction and summarization
    try {
      const transcript = await getYouTubeTranscript();
      log.success('Transcript extracted, sending for summarization');
      
      // Update panel to show loading state
      updatePanelContent(`
        <div class="loading">
          <i class="fas fa-circle-notch fa-spin"></i>
          <span>Generating summary...</span>
        </div>
      `);

      // Send to background script for summarization
      const response = await chrome.runtime.sendMessage({
        action: 'summarize',
        transcript
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Update panel with summary
      updatePanelContent(response.summary);
      log.success('Summary displayed successfully');
    } catch (error) {
      log.error('Failed to generate summary:', error);
      updatePanelContent(error.message, true);
    }
  } catch (error) {
    log.error('Initialization failed:', error);
    if (error.message.includes('Timeout')) {
      updatePanelContent('Transcript not available for this video.', true);
    } else {
      updatePanelContent(error.message, true);
    }
  }
}

// Listen for page navigation
let currentUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (currentUrl.includes('youtube.com/watch')) {
      log.info('URL changed, reinitializing');
      initialize();
    }
  }
});

observer.observe(document.querySelector('body'), {
  childList: true,
  subtree: true
});

// Initial load
if (location.href.includes('youtube.com/watch')) {
  log.info('Initial page load detected');
  initialize();
} 