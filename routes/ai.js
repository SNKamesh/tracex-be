// tracex-be/routes/ai.js
const express = require('express');
const router = express.Router();
const { generateGroqResponse } = require('../services/groq');
const { processWithGroq } = require('../services/notexProcessor'); 
const { validateAiRequest } = require('../middleware/validateAi');
const { aiRateLimiter } = require('../middleware/rateLimit');

// Main chat route - updated to use Groq exclusively
router.post('/chat', aiRateLimiter, validateAiRequest, async (req, res, next) => {
    try {
        const { prompt, history } = req.body;
        
        // Call your Groq service directly
        const responseText = await generateGroqResponse(prompt, history);
        
        return res.status(200).json({
            success: true,
            provider: 'groq',
            data: responseText
        });
    } catch (error) {
        next(error);
    }
});

// NoteX Bot route - processes text structures exclusively via Groq
router.post('/notex/process', aiRateLimiter, async (req, res, next) => {
    try {
        const { documentText, formatType } = req.body;
        
        if (!documentText) {
            return res.status(400).json({ 
                success: false, 
                error: 'No document text provided.' 
            });
        }

        // Send text directly to the Groq processor
        const structuredNotes = await processWithGroq(documentText, formatType);
        
        return res.status(200).json({
            success: true,
            data: structuredNotes
        });
    } catch (error) {
        next(error);
    }
});

export default router;