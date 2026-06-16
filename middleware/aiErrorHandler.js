export const errorHandler = (err, req, res, next) => {
  console.error('AI Service Error:', err);
  
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error processing AI request';

  res.status(statusCode).json({
      success: false,
      error: message
  });
};