import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export async function generateGroqResponse(prompt, history = []) {
    try {
        const messages = [...history, { role: 'user', content: prompt }];
        
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama3-8b-8192', // Default Groq model
            temperature: 0.7,
        });

        return chatCompletion.choices[0]?.message?.content || '';
    } catch (error) {
        console.error('Groq API Error:', error);
        throw new Error('Failed to generate response from Groq');
    }
}