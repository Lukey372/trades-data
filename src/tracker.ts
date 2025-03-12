import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
  ParsedMessageAccount
} from '@solana/web3.js';
import { walletConfig } from './walletConfig';
import { getFungibleTokenSymbol } from './heliusAssetHelper';
import { sendTradeData } from './tradeDataSender';

const SOLSCAN_URL = "https://solscan.io/tx/";
// Set your RPC endpoint for your connection
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://solana-mainnet.g.alchemy.com/v2/avjqC3geUsKYrVWrDdrxr6LaKcFAvvAQ";
const connection = new Connection(RPC_ENDPOINT);

// Helius RPC endpoint (including your API key)
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://lb.drpc.org/ogrpc?network=solana&dkey=AkYT4H_CkkdZk6XMwVLfQb80eMae_gQR76DynqSgS7QB";

// Start polling for each tracked wallet
export function startWalletTracker(): void {
  for (const walletAddress of Object.keys(walletConfig)) {
    pollWallet(walletAddress);
  }
}

// Poll a wallet for new transactions every 10 seconds
async function pollWallet(walletAddress: string): Promise<void> {
  const publicKey = new PublicKey(walletAddress);
  let lastSignature: string | null = null;

  while (true) {
    try {
      // Fetch the most recent 5 transaction signatures for this wallet
      const signatures: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(publicKey, { limit: 5 });
      if (signatures.length > 0) {
        const latestSignature = signatures[0].signature;

        // If we have a new latest signature, process any unseen transactions
        if (lastSignature !== latestSignature) {
          // Identify new signatures not seen before
          const newSignatures: string[] = [];
          for (const sigInfo of signatures) {
            if (sigInfo.signature === lastSignature) break;
            newSignatures.push(sigInfo.signature);
          }

          // Batch fetch parsed transactions
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
    } catch (error) {
      console.error(`Error polling wallet ${walletAddress}:`, error);
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Process a parsed transaction to determine if it’s a buy or sell alert,
// then send the trade data to our API endpoint.
async function processTransaction(walletAddress: string, tx: ParsedTransactionWithMeta): Promise<void> {
  const walletInfo = walletConfig[walletAddress];
  if (!walletInfo || !tx.meta) return;

  // Find the index for the tracked wallet in the transaction's parsed account keys.
  const accountIndex = tx.transaction.message.accountKeys.findIndex(
    (acc: ParsedMessageAccount) => acc.pubkey.toString() === walletAddress
  );
  if (accountIndex === -1) return;

  // Get the wallet's pre- and post-transaction SOL balances (in lamports)
  const preBalance = tx.meta.preBalances[accountIndex];
  const postBalance = tx.meta.postBalances[accountIndex];
  const solChange = (postBalance - preBalance) / 1e9; // convert lamports to SOL

  // Determine token balance changes
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

  // Basic logic:
  // • Buy alert: SOL decreases and at least one token balance increases
  // • Sell alert: SOL increases and at least one token balance decreases
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

  if (isBuy || isSell) {
    // Skip alerts for wrapped SOL
    if (tokenInfo && tokenInfo.mint === "So11111111111111111111111111111111111111112") {
      return;
    }

    // Use Helius to fetch a friendly token symbol for fungible tokens.
    const mintAddress = tokenInfo ? tokenInfo.mint : "N/A";
    let displayedName = mintAddress; // fallback to mint address if no friendly name is found.
    const fetchedSymbol = await getFungibleTokenSymbol(mintAddress, HELIUS_RPC_URL);
    if (fetchedSymbol) {
      displayedName = fetchedSymbol;
    }

    // Build a trade data object for our API
    const tradeData = {
      type: isBuy ? "buy" : "sell",
      wallet: walletInfo.name,
      token: {
        name: displayedName,
        mint: mintAddress,
        change: tokenInfo ? tokenInfo.change : null
      },
      solChange: Math.abs(solChange),
      transaction: {
        signature: tx.transaction.signatures[0],
        url: `${SOLSCAN_URL}${tx.transaction.signatures[0]}`
      },
      timestamp: new Date().toISOString()
    };

    // Send the trade data to the endpoint.
    await sendTradeData(tradeData);
  }
}
