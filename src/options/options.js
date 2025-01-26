// Load saved API key
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (result.geminiApiKey) {
        document.getElementById('apiKey').value = result.geminiApiKey;
    }
});

// Toggle API key visibility
document.getElementById('toggleVisibility').addEventListener('click', () => {
    const input = document.getElementById('apiKey');
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
});

// Save API key
document.getElementById('save').addEventListener('click', async () => {
    const status = document.getElementById('status');
    const apiKey = document.getElementById('apiKey').value.trim();

    // Basic validation
    if (!apiKey) {
        status.textContent = 'Please enter an API key';
        return;
    }

    status.textContent = 'Validating API key...';

    try {
        // Validate API key with a test request
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
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

        // Save valid API key
        await chrome.storage.local.set({ geminiApiKey: apiKey });
        
        status.textContent = 'API key saved successfully!';
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
    }
}); 