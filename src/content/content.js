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

// Ensure DOMPurify is available
if (typeof DOMPurify === 'undefined') {
  log.error('DOMPurify is not loaded. Some features may not work correctly.');
}

// Sanitize HTML content
function sanitizeHTML(html) {
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h3', 'p', 'ul', 'li', 'b'],
      ALLOWED_ATTR: []
    });
  } else {
    // Fallback to basic sanitization
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent;
  }
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log.info('Received message:', request);
  if (request.action === 'summarize') {
    handleSummarization()
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async response
  }
});

async function handleSummarization() {
  try {
    // Get transcript
    const transcript = await getYouTubeTranscript();
    log.success('Got transcript, requesting summary');
    
    // Get summary from background script
    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      transcript
    });
    
    if (response.error) {
      throw new Error(response.error);
    }

    // Update the panel with the summary
    updatePanelContent(response.summary);
    return { success: true };
  } catch (error) {
    log.error('Summarization failed:', error);
    throw error;
  }
}

async function findTranscriptButton() {
  log.info('Looking for transcript button...');

  // Wait for YouTube's menu to be fully loaded
  await new Promise(resolve => setTimeout(resolve, 1000));

  // First, try to find and click the more actions menu if it's not already expanded
  const moreActionsButton = document.querySelector('button[aria-label="More actions"], ytd-menu-renderer button');
  if (moreActionsButton) {
    log.info('Found more actions menu, clicking it');
    moreActionsButton.click();
    // Wait longer for menu to appear and populate
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Try different selectors in order of specificity
  const selectors = [
    // Direct transcript button selectors
    'button[aria-label="Show transcript"]',
    'button[aria-label="Open transcript"]',
    'ytd-menu-service-item-renderer[aria-label="Show transcript"]',
    'ytd-menu-service-item-renderer[aria-label="Open transcript"]',
    
    // Menu item selectors with text content
    'ytd-menu-service-item-renderer:has(yt-formatted-string:contains("transcript"))',
    'ytd-menu-service-item-renderer:has(span:contains("transcript"))',
    
    // Menu popup selectors
    'ytd-menu-popup-renderer ytd-menu-service-item-renderer',
    'tp-yt-paper-listbox ytd-menu-service-item-renderer',
    '#items.ytd-menu-popup-renderer ytd-menu-service-item-renderer',
    
    // More specific menu locations
    '#menu-container ytd-menu-service-item-renderer',
    '#top-level-buttons-computed ytd-menu-service-item-renderer',
    'ytd-menu-renderer ytd-menu-service-item-renderer'
  ];

  // Try each selector multiple times with small delays
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      log.info(`Retry attempt ${attempt + 1} to find transcript button`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      log.info(`Checking selector: ${selector}, found ${elements.length} elements`);
      
      // Try to find button by checking both text content and aria-label
      const transcriptButton = elements.find(element => {
        const text = (element.textContent || '').toLowerCase().trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        const hasTranscriptText = text.includes('transcript') || ariaLabel.includes('transcript');
        
        // Log each potential button for debugging
        if (text || ariaLabel) {
          log.info('Potential button:', { text, ariaLabel, hasTranscript: hasTranscriptText });
        }
        
        return hasTranscriptText;
      });

      if (transcriptButton) {
        log.success('Found transcript button:', {
          selector,
          ariaLabel: transcriptButton.getAttribute('aria-label'),
          text: transcriptButton.textContent.trim()
        });
        return transcriptButton;
      }
    }
  }

  // If still not found, try one last time with the menu items
  const menuItems = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer'));
  for (const item of menuItems) {
    const text = item.textContent.toLowerCase().trim();
    if (text.includes('transcript')) {
      log.success('Found transcript menu item by text content');
      return item;
    }
  }

  // Before giving up, check if video might not have transcripts
  const player = document.querySelector('video');
  if (player) {
    const videoTime = player.duration;
    if (typeof videoTime === 'undefined' || videoTime === 0) {
      throw new Error('Video is not yet loaded. Please wait a moment and try again.');
    }
  }

  // Log all menu items for debugging
  log.error('Could not find transcript button. Available menu items:', 
    menuItems.map(item => ({
      text: item.textContent.trim(),
      ariaLabel: item.getAttribute('aria-label'),
      visible: item.offsetParent !== null,
      classes: item.className
    })).filter(item => item.text || item.ariaLabel)
  );

  return null;
}

async function clickTranscriptButton(button) {
  log.info('Attempting to click transcript button');
  
  try {
    // If it's a menu item, we need to click differently
    const isMenuItem = button.tagName.toLowerCase() === 'ytd-menu-service-item-renderer';
    
    if (isMenuItem) {
      log.info('Clicking menu item');
      // For menu items, we need to click the inner button
      const innerButton = button.querySelector('button') || button;
      innerButton.click();
    } else {
      // Regular button clicking logic
      button.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      button.click();
    }
    log.info('Direct click executed');
    
    // Wait to see if panel appears
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if panel appeared
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
    if (panel) {
      log.success('Panel appeared after click');
      return true;
    }
    
    log.info('Panel not visible after click attempts');
    return false;
  } catch (error) {
    log.error('Error while clicking button:', error);
    return false;
  }
}

// Add function to close transcript panel
async function closeTranscriptPanel() {
  log.info('Attempting to close transcript panel');
  try {
    // Try to find the close button with the specific class and aria-label
    const closeButton = document.querySelector(
      'button.yt-spec-button-shape-next[aria-label="Close transcript"], ' +
      'button.yt-spec-button-shape-next--text[aria-label="Close transcript"]'
    );

    if (closeButton) {
      log.info('Found close button, clicking it');
      closeButton.click();
      
      // Wait a moment and verify panel is closed
      await new Promise(resolve => setTimeout(resolve, 500));
      const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
      if (!panel || panel.hasAttribute('hidden') || !panel.isConnected) {
        log.success('Transcript panel closed successfully');
        return true;
      }
    } else {
      log.info('No close button found, trying alternative methods');
    }

    // If close button not found or didn't work, try clicking outside
    document.body.click();
    log.info('Attempted to close panel by clicking outside');
    
    // Verify panel is closed
    await new Promise(resolve => setTimeout(resolve, 500));
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
    if (!panel || panel.hasAttribute('hidden') || !panel.isConnected) {
      log.success('Transcript panel closed by clicking outside');
      return true;
    }

    // If still not closed, try to find any button with close icon
    const anyCloseButton = Array.from(document.querySelectorAll('button')).find(button => {
      const ariaLabel = button.getAttribute('aria-label');
      return ariaLabel && ariaLabel.toLowerCase().includes('close transcript');
    });

    if (anyCloseButton) {
      log.info('Found alternative close button, attempting to click');
      anyCloseButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const finalCheck = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
      if (!finalCheck || finalCheck.hasAttribute('hidden') || !finalCheck.isConnected) {
        log.success('Transcript panel closed using alternative button');
        return true;
      }
    }

    log.error('Failed to close transcript panel after all attempts');
    return false;
  } catch (error) {
    log.error('Error while closing transcript panel:', error);
    return false;
  }
}

async function getYouTubeTranscript() {
  try {
    log.info('Starting transcript extraction');
    
    // First, check if transcript panel is already open
    let transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');
    let needsToClick = !transcriptPanel;
    
    if (needsToClick) {
      // Find the transcript button using our improved method
      const button = await findTranscriptButton();
      if (!button) {
        throw new Error('Could not find transcript button. Please ensure video has transcripts available.');
      }

      // Try clicking the button with our improved method
      const clickSuccess = await clickTranscriptButton(button);
      if (!clickSuccess) {
        log.info('First click attempt failed, trying again...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const secondClickSuccess = await clickTranscriptButton(button);
        if (!secondClickSuccess) {
          throw new Error('Failed to open transcript panel after clicking button.');
        }
      }

      // Wait for the panel to appear
      try {
        transcriptPanel = await waitForElement('ytd-transcript-segment-list-renderer', 5000);
        log.success('Transcript panel loaded successfully');
      } catch (error) {
        throw new Error('Failed to load transcript panel after clicking button.');
      }
    }

    // Wait a moment for segments to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get all transcript segments
    let segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments.length) {
      log.info('No segments found immediately, waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 2000));
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

    // Close the transcript panel
    if (needsToClick) {
      await closeTranscriptPanel();
    }

    return transcript.trim();
  } catch (error) {
    // Try to close panel even if we got an error
    try {
      await closeTranscriptPanel();
    } catch (closeError) {
      log.error('Error while closing panel after failure:', closeError);
    }
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

// Add this helper function for element waiting
async function waitForElement(selector, timeout = 5000) {
  log.info(`Waiting for element: ${selector}`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) {
      log.success(`Found element: ${selector}`);
      return element;
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  
  log.error(`Timeout waiting for element: ${selector}`);
  throw new Error(`Timeout waiting for ${selector}`);
}

// Main initialization function
async function initialize() {
  try {
    log.info('Starting initialization');

    // Wait for video to be loaded
    const videoPlayer = await waitForElement('video');
    if (!videoPlayer) {
      throw new Error('Video player not found');
    }

    // Wait for video metadata to be loaded
    if (!videoPlayer.duration) {
      log.info('Waiting for video metadata...');
      await new Promise((resolve) => {
        videoPlayer.addEventListener('loadedmetadata', resolve, { once: true });
        // Timeout after 10 seconds
        setTimeout(resolve, 10000);
      });
    }

    // Add Font Awesome
    addFontAwesome();
    
    // Wait for the secondary column
    const secondaryColumn = await waitForElement('#secondary');
    log.info('Found secondary column');
    
    // Create and inject panel
    const panel = createSummaryPanel();
    secondaryColumn.insertBefore(panel, secondaryColumn.firstChild);
    log.success('Summary panel injected');

    // Wait a moment for YouTube's UI to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Get transcript and generate summary
      const transcript = await getYouTubeTranscript();
      log.success('Got transcript, requesting summary');
      
      // Request summary from background script
      const response = await chrome.runtime.sendMessage({
        action: 'summarize',
        transcript
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      updatePanelContent(response.summary);
      log.success('Summary displayed successfully');
    } catch (error) {
      log.error('Failed to generate summary:', error);
      updatePanelContent(error.message, true);
    }
  } catch (error) {
    log.error('Failed to initialize:', error);
    updatePanelContent(error.message, true);
  }
}

// Listen for page navigation with debounce
let currentUrl = location.href;
let initializeTimeout;

const observer = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    if (currentUrl.includes('youtube.com/watch')) {
      // Clear any pending initialization
      if (initializeTimeout) {
        clearTimeout(initializeTimeout);
      }
      // Delay initialization to ensure page is loaded
      initializeTimeout = setTimeout(() => {
        initialize();
      }, 2000);
    }
  }
});

observer.observe(document.querySelector('body'), {
  childList: true,
  subtree: true
});

// Initial load with delay
if (location.href.includes('youtube.com/watch')) {
  // Delay initial load to ensure page is ready
  setTimeout(() => {
    initialize();
  }, 2000);
} 