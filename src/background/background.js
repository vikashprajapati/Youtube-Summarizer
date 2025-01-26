// Get API key from Chrome storage
async function getApiKey() {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (!result.geminiApiKey) {
        throw new Error('API key not configured. Please set your Gemini API key in the extension options.');
    }
    return result.geminiApiKey;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    summarizeTranscript(request.transcript)
      .then(summary => sendResponse({ summary }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function summarizeTranscript(transcript) {
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

  try {
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
      throw new Error('Failed to generate summary');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Summarization error:', error);
    throw new Error('Failed to generate summary: ' + error.message);
  }
} 