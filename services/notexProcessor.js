// tracex-be/services/notexProcessor.js
const { generateGroqResponse } = require('./groq');

/**
 * Processes document text using Groq to format into clean study guides/notes
 * @param {string} documentText 
 * @param {string} formatType (e.g., 'Summarize', 'Explain', 'Improve')
 */
async function processWithGroq(documentText, formatType) {
    let systemPrompt = `You are NoteX AI, a premium study and writing workspace assistant. `;
    
    if (formatType === 'Summarize') {
        systemPrompt += "Provide a structured summary with key takeaways, bullet points, and main ideas.";
    } else if (formatType === 'Explain') {
        systemPrompt += "Explain the concepts in this text clearly with analogies, assuming the reader is a student.";
    } else if (formatType === 'Improve') {
        systemPrompt += "Refine the writing style, fix grammatical flow, and optimize the layout for readability.";
    } else {
        systemPrompt += `Format, process, or answer questions regarding this text based on instructions: ${formatType}`;
    }

    const fullPrompt = `${systemPrompt}\n\n--- DOCUMENT START ---\n${documentText}\n--- DOCUMENT END ---`;
    
    // Pass everything directly to Groq
    return await generateGroqResponse(fullPrompt, []);
}

module.exports = {
    processWithGroq
};