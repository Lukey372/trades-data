import express from 'express';
import { startWalletTracker } from './tracker';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('Trade Bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startWalletTracker();
});
