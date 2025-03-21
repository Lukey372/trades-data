import fetch from 'node-fetch';

const BATCH_SIZE = 10;
const BATCH_INTERVAL = 1000; // 1 second

class TradeDataBatcher {
  private batch: any[] = [];
  private timer: NodeJS.Timeout | null = null;

  async addTrade(tradeData: any) {
    this.batch.push(tradeData);

    if (this.batch.length >= BATCH_SIZE) {
      await this.sendBatch();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.sendBatch(), BATCH_INTERVAL);
    }
  }

  private async sendBatch() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.batch.length === 0) return;

    const batchToSend = [...this.batch];
    this.batch = [];

    try {
      const response = await fetch('https://trades-data.onrender.com/api/trades/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchToSend)
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}`);
      }
      console.log(`Successfully sent batch of ${batchToSend.length} trades`);
    } catch (error) {
      console.error("Error sending trade batch:", error);
      // Re-add failed trades to the batch
      this.batch = [...batchToSend, ...this.batch];
    }
  }
}

const batcher = new TradeDataBatcher();

export async function sendTradeData(tradeData: any): Promise<void> {
  await batcher.addTrade(tradeData);
}
