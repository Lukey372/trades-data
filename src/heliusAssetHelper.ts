import fetch from 'node-fetch';
import { heliusRateLimiter } from './rateLimit';

export async function getFungibleTokenSymbol(
  mintAddress: string,
  heliusRpcUrl: string
): Promise<string | null> {
  const body = {
    jsonrpc: '2.0',
    id: 'my-id',
    method: 'getAsset',
    params: {
      id: mintAddress,
      displayOptions: {
        showFungible: true
      }
    }
  };

  return heliusRateLimiter.execute(async () => {
    try {
      const response = await fetch(heliusRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Helius RPC responded with HTTP ${response.status}`);
      }

      const json = await response.json();
      const result = json.result;
      if (!result || !result.content || !result.content.metadata) {
        return null;
      }

      const { symbol, name } = result.content.metadata;
      return symbol || name || null;
    } catch (error) {
      console.error(`Failed to fetch Helius asset data for ${mintAddress}:`, error);
      return null;
    }
  });
}
