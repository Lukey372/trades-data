import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import { startWalletTracker } from './tracker';

const app = express();
const PORT = process.env.PORT || 3000;

// Use environment variables for sensitive info
const REDIS_HOST = process.env.REDIS_HOST || 'prepared-seasnail-61455.upstash.io';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'AfAPAAIjcDE4NjkyNTI4YzFjN2M0MjVkOWY1YWQ5ZTVlNWE4YzQ0NnAxMA';

// Use rediss:// protocol for TLS/SSL connections, include the password in the URL
const REDIS_URL = process.env.REDIS_URL || `rediss://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`;

app.use(express.json());

// Whitelist specific domains
const allowedOrigins = [
  'https://www.tilt.wtf',
  'https://frontend-gamma-six-35.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create and connect a Redis client with TLS/SSL enabled and password
const redisClient = createClient({
  url: REDIS_URL,
  socket: {
    tls: true,
    // Adjust rejectUnauthorized as needed for your certificate setup
    rejectUnauthorized: false
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis with TLS/SSL.');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
})();

// POST endpoint: receives trade data from the tracker and stores it in separate Redis lists
app.post('/api/trades', async (req, res) => {
  const tradeData = req.body;
  console.log('Received trade data:', tradeData);
  try {
    // Determine which list to push the trade to based on its type
    const key = tradeData.type === 'buy' ? 'trades:buys' : 'trades:sells';
    
    // Store trade data as a JSON string in the appropriate Redis list
    await redisClient.rPush(key, JSON.stringify(tradeData));
    
    // Optionally, trim the list to a maximum of 100 items (or any limit you choose)
    await redisClient.lTrim(key, -100, -1);
    
    res.status(200).json({ message: 'Trade data received successfully.' });
  } catch (err) {
    console.error('Error saving trade data to Redis:', err);
    res.status(500).json({ error: 'Failed to save trade data.' });
  }
});

// GET endpoint: retrieves the latest 10 buys and 10 sells from their respective Redis lists
app.get('/api/trades', async (_req, res) => {
  try {
    // Retrieve the data from the separate lists
    const buysRaw = await redisClient.lRange('trades:buys', 0, -1);
    const sellsRaw = await redisClient.lRange('trades:sells', 0, -1);
    
    // Parse the JSON strings back into objects
    const buys = buysRaw.map(trade => JSON.parse(trade));
    const sells = sellsRaw.map(trade => JSON.parse(trade));
    
    // Since the lists are stored oldest first, slice the last 10 entries and reverse to get the newest first
    const latestBuys = buys.slice(-10).reverse();
    const latestSells = sells.slice(-10).reverse();
    
    res.json({ buys: latestBuys, sells: latestSells });
  } catch (err) {
    console.error('Error retrieving trade data from Redis:', err);
    res.status(500).json({ error: 'Failed to retrieve trade data.' });
  }
});

// Basic route to confirm the service is running
app.get('/', (_req, res) => {
  res.send('Trade Bot API is running.');
});

// Start the server and then the wallet tracker
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startWalletTracker();
});
