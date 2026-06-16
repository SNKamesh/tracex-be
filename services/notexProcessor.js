import { generateGroqResponse } from './groq.js';

/**
 * Processes document text using Groq to format into clean study guides/notes
 * @param {string} documentText 
 * @param {string} formatType (e.g., 'Summarize', 'Explain', 'Improve')
 */
export async function processWithGroq(documentText, formatType) {
    let systemPrompt = `You are NoteX AI, a premium study and writing workspace assistant. `;
    
    if (formatType === 'Summarize' || formatType === 'summarize') {
        systemPrompt += "Provide a structured summary with key takeaways, bullet points, and main ideas.";
    } else if (formatType === 'Explain' || formatType === 'explain') {
        systemPrompt += "Explain the concepts in this text clearly with analogies, assuming the reader is a student.";
    } else if (formatType === 'Improve' || formatType === 'improve') {
        systemPrompt += "Refine the writing style, fix grammatical flow, and optimize the layout for readability.";
    } else {
        systemPrompt += `Format, process, or answer questions regarding this text based on instructions: ${formatType}`;
    }

    const fullPrompt = `${systemPrompt}\n\n--- DOCUMENT START ---\n${documentText}\n--- DOCUMENT END ---`;
    
    return await generateGroqResponse(fullPrompt, []);
}