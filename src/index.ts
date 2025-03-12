import express from 'express';
import { startWalletTracker } from './tracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// Basic route to confirm the service is running
app.get('/', (_req, res) => {
  res.send('Trade Bot API is running.');
});

// GET endpoint for /api/trades – useful for confirming the route is active
app.get('/api/trades', (_req, res) => {
  res.json({ message: 'This endpoint accepts POST requests for trade data.' });
});

// POST endpoint for receiving trade data from the tracker
app.post('/api/trades', (req, res) => {
  const tradeData = req.body;
  console.log('Received trade data:', tradeData);
  // Process or store the trade data here if needed
  res.status(200).json({ message: 'Trade data received successfully.' });
});

// Start the server, then start the wallet tracker
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startWalletTracker();
});
