// Add logging utility
const log = {
  info: (message, data) => {
    console.log(`[Background] 📘 ${message}`, data || '');
  },
  error: (message, error) => {
    console.error(`[Background] ❌ ${message}`, error);
  },
  success: (message, data) => {
    console.log(`[Background] ✅ ${message}`, data || '');
  }
};

// Get API key from Chrome storage
async function getApiKey() {
  log.info('Retrieving API key from storage');
  const result = await chrome.storage.local.get(['geminiApiKey']);
  if (!result.geminiApiKey) {
    log.error('API key not found in storage');
    throw new Error('API key not configured. Please set your Gemini API key in the extension options.');
  }
  log.success('API key retrieved successfully');
  return result.geminiApiKey;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    log.info('Received summarization request', { transcriptLength: request.transcript.length });
    summarizeTranscript(request.transcript)
      .then(summary => {
        log.success('Summary generated successfully', { summaryLength: summary.length });
        sendResponse({ summary });
      })
      .catch(error => {
        log.error('Summarization failed:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function summarizeTranscript(transcript) {
  try {
    log.info('Starting transcript summarization');
    const apiKey = await getApiKey();

    const prompt = `
      Summarize this YouTube video transcript in a clear, structured format:

      ${transcript}

      Please format the response as follows:
      1. Start with a brief (2-3 sentences) overview of what the video is about
      2. List 4-5 key points using bullet points
      3. Use appropriate HTML formatting:
         - <h3> for section headings
         - <p> for the overview
         - <ul> and <li> for bullet points
         - <b> for emphasis on important terms
      4. Keep it concise and easy to read
    `;

    log.info('Sending request to Gemini API');
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      log.error('API request failed:', { status: response.status });
      throw new Error('Failed to generate summary');
    }

    const data = await response.json();
    log.success('Received API response successfully');
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    log.error('Summarization error:', error);
    throw new Error('Failed to generate summary: ' + error.message);
  }
} 