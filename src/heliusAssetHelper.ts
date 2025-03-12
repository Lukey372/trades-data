import fetch from 'node-fetch';

/**
 * Query Helius for asset data using the `getAsset` method.
 * This call returns metadata for a fungible token including its symbol.
 *
 * @param mintAddress The token mint address to query.
 * @param heliusRpcUrl Your Helius RPC URL (including your API key).
 * @returns The token symbol (or name) if available, or null if not found.
 */
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

    // Return the symbol if available, otherwise fall back to name.
    const { symbol, name } = result.content.metadata;
    return symbol || name || null;
  } catch (error) {
    console.error(`Failed to fetch Helius asset data for ${mintAddress}:`, error);
    return null;
  }
}
