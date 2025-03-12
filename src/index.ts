import express from 'express';
import { startWalletTracker } from './tracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Define the /api/trades POST endpoint
app.post('/api/trades', (req, res) => {
  const tradeData = req.body;
  console.log('Received trade data:', tradeData);
  // Here you can process, log, or store the trade data as needed.
  res.status(200).json({ message: 'Trade data received successfully.' });
});

// Optional: a simple GET route to verify the server is running.
app.get('/', (_req, res) => {
  res.send('Trade Bot API is running.');
});

// Start the server and then the tracker.
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Start the wallet tracker after the server is up.
  startWalletTracker();
});
