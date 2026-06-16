export const validateAiRequest = (req, res, next) => {
  const { prompt, documentText } = req.body;

  if (!prompt && !documentText) {
      return res.status(400).json({
          success: false,
          error: 'Missing required fields: prompt or documentText is required.'
      });
  }
  
  next();
};