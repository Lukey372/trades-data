import fetch from 'node-fetch';

export async function sendTradeData(tradeData: any): Promise<void> {
  try {
    const response = await fetch('https://trades-data.onrender.com/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tradeData)
    });

    if (!response.ok) {
      throw new Error(`API responded with HTTP ${response.status}`);
    }
    
    console.log('Successfully sent trade data');
  } catch (error) {
    console.error("Error sending trade data:", error);
    throw error; // Re-throw to let the caller handle the error
  }
}
