import express from 'express';
import { generateGroqResponse } from '../services/groq.js';
import { processWithGroq } from '../services/notexProcessor.js';
import { validateAiRequest } from '../middleware/validateAi.js';
import { aiRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Main chat route
router.post('/chat', aiRateLimiter, validateAiRequest, async (req, res, next) => {
    try {
        const { prompt, history } = req.body;
        
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

// NoteX Bot route
router.post('/notex/process', aiRateLimiter, async (req, res, next) => {
    try {
        const { documentText, formatType } = req.body;
        
        if (!documentText) {
            return res.status(400).json({ 
                success: false, 
                error: 'No document text provided.' 
            });
        }

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