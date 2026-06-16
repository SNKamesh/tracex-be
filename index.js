import express from 'express';
import cors from 'cors';
import aiRoutes from './routes/ai.js';
import { errorHandler } from './middleware/aiErrorHandler.js';

const app = express();

// FORCE OPEN CORS: Allows Vercel, localhost, and everything else to connect without being blocked
app.use(cors());
app.use(express.json());

app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.status(200).send('Tracex Backend is ALIVE and OPEN');
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server successfully listening on port ${PORT}`);
});