import express from 'express';
import WebSocket, { RawData } from 'ws';

interface TradeData {
  user: string;
  sol_amount: number;
  name: string;
  is_buy: boolean;
  timestamp: number;
  mint?: string;
  usd_market_cap?: number;
}

interface TradeEvent {
  user: string;
  sol_amount: number; // store as a number for efficiency
  name: string;
  timestamp: number;  // store as a raw number; conversion on demand
  mint: string | null;
  usd_market_cap: number | null;
}

// Map of known addresses
const USER_MAP: { [address: string]: string } = {
  "JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN": "West",
  "GwoFJFjUTUSWq2EwTz4P2Sznoq9XYLrf8t4q5kbTgZ1R": "Levis",
  "EHg5YkU2SZBTvuT87rUsvxArGp3HLeye1fXaSDfuMyaf": "TIL",
  "BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd": "Kev",
  "2CXbN6nuTTb4vCrtYM89SfQHMMKGPAW4mvFe6Ht4Yo6z": "MoneyMaykah",
  "7ABz8qEFZTHPkovMDsmQkm64DZWN5wRtU7LEtD2ShkQ6": "Red",
  "BXNiM7pqt9Ld3b2Hc8iT3mA5bSwoe9CRrtkSUs15SLWN": "Absol",
  "5TuiERc4X7EgZTxNmj8PHgzUAfNHZRLYHKp4DuiWevXv": "Rev",
  "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk": "Jijo",
  "831yhv67QpKqLBJjbmw2xoDUeeFHGUx8RnuRj9imeoEs": "Trey",
  "DpNVrtA3ERfKzX4F8Pi2CVykdJJjoNxyY5QgoytAwD26": "Gorilla Capital",
  "BCnqsPEtA1TkgednYEebRpkmwFRJDCjMQcKZMMtEdArc": "Kreo",
  "7iabBMwmSvS4CFPcjW2XYZY53bUCHzXjCFEFhxeYP4CY": "Leens",
  "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR": "Casino",
  "D2wBctC1K2mEtA17i8ZfdEubkiksiAH2j8F7ri3ec71V": "Dior",
  "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj": "Euris",
  "4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh": "Mr. Frog",
  "F2SuErm4MviWJ2HzKXk2nuzBC6xe883CFWUDCPz6cyWm": "Earl",
  "CSHktdVEmJybwNR9ft3sDfSc2UKgTPZZ8km26XfHYZDt": "Lynk",
  "7tiRXPM4wwBMRMYzmywRAE6jveS3gDbNyxgRrEoU6RLA": "QtDegen",
  "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o": "Cented",
  "34ZEH778zL8ctkLwxxERLX5ZnUu6MuFyX9CWrs8kucMw": "Groovy",
  "2kv8X2a9bxnBM8NKLc6BBTX2z13GFNRL4oRotMUJRva9": "Gh0stee",
  "5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG": "Yenni",
  "215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP": "OGAntD",
  "2YJbcB9G8wePrpVBcT31o8JEed6L3abgyCjt5qkJMymV": "AI4N",
  "8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6": "Cooker",
  "Gv7CnRo2L2SJ583XEfoKHKbmWK3wNoBDxVoJqMKJR4Nu": "Robo",
  "41uh7g1DxYaYXdtjBiYCHcgBniV9Wx57b7HU7RXmx1Gg": "Lowskii",
  "99i9uVA7Q56bY22ajKKUfTZTgTeP5yCtVGsrG9J4pDYQ": "Zrool",
  "9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL": "Loopier",
};

const buy_events: TradeEvent[] = [];
const sell_events: TradeEvent[] = [];

const MAX_TRADES = 50;
const ENABLE_LOGS = false;

// Helper function to create a WebSocket connection with heartbeat checking.
function connectToSocket(uri: string): void {
  function connect(): void {
    const ws = new WebSocket(uri);
    let lastPing = Date.now();
    const pingInterval = 25000; // as provided by the handshake
    const pingTimeoutBuffer = 5000; // extra buffer

    // Set up a timer to check for heartbeat timeouts.
    const pingTimer = setInterval(() => {
      if (Date.now() - lastPing > pingInterval + pingTimeoutBuffer) {
        if (ENABLE_LOGS) console.log(`[WARNING] Ping timeout on ${uri}. Terminating connection.`);
        ws.terminate();
      }
    }, pingInterval);

    ws.on('open', () => {
      if (ENABLE_LOGS) console.log(`[OPEN] Connected to ${uri}`);
      ws.send("40");
    });

    ws.on('message', (data: RawData) => {
      const message = typeof data === 'string' ? data : data.toString();

      // Handle ping messages from the server.
      if (message === "2") {
        lastPing = Date.now();
        ws.send("3");
        return;
      }

      if (message.startsWith("42")) {
        try {
          const payload = JSON.parse(message.substring(2));
          if (payload[0] === "tradeCreated") {
            const tradeData: TradeData = payload[1];

            // Log the full raw payload
            if (ENABLE_LOGS) console.log("[RAW tradeCreated]:", tradeData);

            // Log formatted trade info
            const localTime = new Date(tradeData.timestamp * 1000).toLocaleString();
            if (ENABLE_LOGS) {
              console.log(`User: ${tradeData.user} ${tradeData.is_buy ? 'Bought' : 'Sold'} ${tradeData.sol_amount / 1_000_000_000} SOL worth of ${tradeData.name} at ${localTime}`);
            }

            // Only store trade if user exists in USER_MAP.
            if (!USER_MAP[tradeData.user]) {
              return;
            }

            const event: TradeEvent = {
              user: tradeData.user,
              sol_amount: tradeData.sol_amount / 1_000_000_000,
              name: tradeData.name,
              timestamp: tradeData.timestamp,
              mint: tradeData.mint || null,
              usd_market_cap: tradeData.usd_market_cap || null,
            };

            if (tradeData.is_buy) {
              buy_events.push(event);
              if (buy_events.length > MAX_TRADES) {
                buy_events.shift();
              }
            } else {
              sell_events.push(event);
              if (sell_events.length > MAX_TRADES) {
                sell_events.shift();
              }
            }

            if (ENABLE_LOGS) {
              console.log(`[STORE] ${USER_MAP[tradeData.user]} ${tradeData.is_buy ? "BUY" : "SELL"}: ${event.sol_amount.toFixed(4)} SOL of ${event.name}`);
            }
          } else if (ENABLE_LOGS) {
            console.log(`[INFO] Unknown payload:`, payload);
          }
        } catch (err) {
          if (ENABLE_LOGS) {
            console.log("[ERROR] Parsing message:", err);
          }
        }
      } else if (ENABLE_LOGS) {
        console.log(`[INFO] Non-42 message from ${uri}: ${message}`);
      }
    });

    ws.on('close', () => {
      if (ENABLE_LOGS) {
        console.log(`[CLOSE] Disconnected from ${uri}, reconnecting in 5s...`);
      }
      clearInterval(pingTimer);
      setTimeout(connect, 5000);
    });

    ws.on('error', (err: Error) => {
      if (ENABLE_LOGS) {
        console.log(`[ERROR] WebSocket error on ${uri}:`, err);
      }
      ws.terminate();
    });
  }
  connect();
}

function pumpFunListener() {
  // Subscribe to both endpoints.
  connectToSocket("wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket");
}

pumpFunListener();

// Express server to serve the trade events.
const app = express();

app.get('/api/trades', (req, res) => {
  res.json({
    buys: buy_events.slice(-20),
    sells: sell_events.slice(-20),
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`[INFO] Web server running on port ${port}`);
});
