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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for panel to load
      
      transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');
      if (!transcriptPanel) {
        throw new Error('Failed to load transcript panel');
      }
      log.success('Transcript panel opened successfully');
    }

    // Get all transcript segments
    const segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) {
      throw new Error('No transcript segments found');
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
      throw new Error('Failed to extract transcript text');
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
function waitForElement(selector, timeout = 5000) {
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
    // Add Font Awesome
    addFontAwesome();
    
    // Wait for the secondary column
    const secondaryColumn = await waitForElement('#secondary');
    
    // Create and inject panel
    const panel = createSummaryPanel();
    secondaryColumn.insertBefore(panel, secondaryColumn.firstChild);
  } catch (error) {
    console.error('Failed to initialize:', error);
    updatePanelContent(error.message, true);
  }
}

// Listen for page navigation
let currentUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (currentUrl.includes('youtube.com/watch')) {
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
  initialize();
} 