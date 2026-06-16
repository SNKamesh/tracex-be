import express from 'express';
import cors from 'cors';
import aiRoutes from './routes/ai.js';
import { errorHandler } from './middleware/aiErrorHandler.js';

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'https://tracex-gdbl.vercel.app' // Allows your frontend to talk to this backend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.status(200).send('Tracex Backend Running on Groq Engine (ESM)');
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server successfully listening on port ${PORT}`);
});