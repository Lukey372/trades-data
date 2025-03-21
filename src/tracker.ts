import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { walletConfig } from './walletConfig';
import { getFungibleTokenSymbol } from './heliusAssetHelper';
import { sendTradeData } from './tradeDataSender';
import { dexscreenerRateLimiter, solanaRpcRateLimiter } from './rateLimit';

const SOLSCAN_URL = "https://solscan.io/tx/";
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://solana-mainnet.g.alchemy.com/v2/IK5lnC5WolkFNY5M5qr8AAvEdh_e3Z1e";
const connection = new Connection(RPC_ENDPOINT);
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=29217866-4f39-43ed-893f-d730d7cf295c";

// Cache for token symbols to reduce API calls
const tokenSymbolCache = new Map<string, string>();
const TOKEN_CACHE_DURATION = 1000 * 60 * 60; // 1 hour

async function fetchDexscreenerData(mintAddress: string) {
  return dexscreenerRateLimiter.execute(async () => {
    const url = `https://api.dexscreener.com/tokens/v1/solana/${mintAddress}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`Dexscreener API error: ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const dexData = data[0];
        return {
          priceUsd: dexData.priceUsd,
          marketCap: dexData.marketCap
        };
      }
      return null;
    } catch (error) {
      console.error("Error fetching Dexscreener data", error);
      return null;
    }
  });
}

async function getTokenSymbol(mintAddress: string): Promise<string> {
  // Check cache first
  const cached = tokenSymbolCache.get(mintAddress);
  if (cached) return cached;

  const symbol = await getFungibleTokenSymbol(mintAddress, HELIUS_RPC_URL);
  if (symbol) {
    tokenSymbolCache.set(mintAddress, symbol);
    // Clear cache after duration
    setTimeout(() => tokenSymbolCache.delete(mintAddress), TOKEN_CACHE_DURATION);
  }
  return symbol || mintAddress;
}

export function startWalletTracker(): void {
  const wallets = Object.keys(walletConfig);
  // Stagger wallet polling to avoid overwhelming the RPC
  wallets.forEach((wallet, index) => {
    setTimeout(() => {
      pollWallet(wallet);
    }, index * 1000); // Start each wallet 1 second apart
  });
}

async function pollWallet(walletAddress: string): Promise<void> {
  const publicKey = new PublicKey(walletAddress);
  let lastSignature: string | null = null;

  while (true) {
    try {
      await solanaRpcRateLimiter.execute(async () => {
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
        
        if (signatures.length > 0) {
          const latestSignature = signatures[0].signature;

          if (lastSignature !== latestSignature) {
            const newSignatures = [];
            for (const sigInfo of signatures) {
              if (sigInfo.signature === lastSignature) break;
              newSignatures.push(sigInfo.signature);
            }

            const txs = await connection.getParsedTransactions(newSignatures, {
              maxSupportedTransactionVersion: 0
            });

            for (const tx of txs) {
              if (tx) {
                await processTransaction(walletAddress, tx);
              }
            }
            lastSignature = latestSignature;
          }
        }
      });
    } catch (error) {
      console.error(`Error polling wallet ${walletAddress}:`, error);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

async function processTransaction(walletAddress: string, tx: ParsedTransactionWithMeta): Promise<void> {
  const walletInfo = walletConfig[walletAddress];
  if (!walletInfo || !tx.meta) return;

  const accountIndex = tx.transaction.message.accountKeys.findIndex(
    acc => acc.pubkey.toString() === walletAddress
  );
  if (accountIndex === -1) return;

  const preBalance = tx.meta.preBalances[accountIndex];
  const postBalance = tx.meta.postBalances[accountIndex];
  const solChange = (postBalance - preBalance) / 1e9;

  const tokenChanges: Array<{ mint: string; pre: number; post: number }> = [];
  if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
    for (const postToken of tx.meta.postTokenBalances) {
      const preToken = tx.meta.preTokenBalances.find(pt => pt.accountIndex === postToken.accountIndex);
      const preAmount = preToken ? Number(preToken.uiTokenAmount.amount) : 0;
      const postAmount = Number(postToken.uiTokenAmount.amount);
      if (preAmount !== postAmount) {
        tokenChanges.push({ mint: postToken.mint, pre: preAmount, post: postAmount });
      }
    }
  }

  let isBuy = false;
  let isSell = false;
  let tokenInfo: { mint: string; change: number } | null = null;

  for (const tokenChange of tokenChanges) {
    const change = tokenChange.post - tokenChange.pre;
    if (change > 0 && solChange < 0) {
      isBuy = true;
      tokenInfo = { mint: tokenChange.mint, change };
      break;
    } else if (change < 0 && solChange > 0) {
      isSell = true;
      tokenInfo = { mint: tokenChange.mint, change: Math.abs(change) };
      break;
    }
  }

  if ((isBuy || isSell) && tokenInfo) {
    if (tokenInfo.mint === "So11111111111111111111111111111111111111112") {
      return;
    }

    const [displayedName, dexscreenerData] = await Promise.all([
      getTokenSymbol(tokenInfo.mint),
      fetchDexscreenerData(tokenInfo.mint)
    ]);

    const tradeData = {
      type: isBuy ? "buy" : "sell",
      wallet: walletInfo.name,
      walletAddress: walletAddress,
      token: {
        name: displayedName,
        mint: tokenInfo.mint,
        change: tokenInfo.change
      },
      solChange: Math.abs(solChange),
      dexscreenerUrl: `https://dexscreener.com/solana/${tokenInfo.mint}`,
      priceUsd: dexscreenerData ? dexscreenerData.priceUsd : null,
      marketCap: dexscreenerData ? dexscreenerData.marketCap : null,
      timestamp: new Date().toISOString()
    };

    await sendTradeData(tradeData);
  }
}
