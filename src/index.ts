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
  user: string;       // raw address
  sol_amount: number; // numeric SOL amount
  name: string;
  timestamp: number;  // numeric timestamp
  mint: string | null;
  usd_market_cap: number | null;
}

// Address → Friendly Name
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

// We’ll store only the most recent trades in memory.
const buy_events: TradeEvent[] = [];
const sell_events: TradeEvent[] = [];

const MAX_TRADES = 50;

// Set this to true to enable console logs.
const ENABLE_LOGS = true;

/**
 * Connect to a single WebSocket endpoint, subscribe to events, and store trades.
 */
function connectToSocket(uri: string) {
  function connect() {
    const ws = new WebSocket(uri);

    ws.on('open', () => {
      if (ENABLE_LOGS) console.log(`[OPEN] Connected to ${uri}`);
      // Send "40" for Socket.IO authorization
      ws.send("40");
    });

    ws.on('message', (data: RawData) => {
      const message = typeof data === 'string' ? data : data.toString();

      // Socket.IO heartbeat
      if (message === "2") {
        ws.send("3");
        return;
      }

      // Check for "42" messages
      if (message.startsWith("42")) {
        try {
          const payload = JSON.parse(message.substring(2));
          if (payload[0] === "tradeCreated") {
            const tradeData: TradeData = payload[1];

            // If user not in map, skip
            if (!USER_MAP[tradeData.user]) {
              if (ENABLE_LOGS) {
                console.log(`[SKIP] Unknown user: ${tradeData.user}`);
              }
              return;
            }

            // Build trade event
            const event: TradeEvent = {
              user: tradeData.user,
              sol_amount: tradeData.sol_amount / 1_000_000_000,
              name: tradeData.name,
              timestamp: tradeData.timestamp,
              mint: tradeData.mint || null,
              usd_market_cap: tradeData.usd_market_cap || null,
            };

            // Insert into buy or sell
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
              const userName = USER_MAP[tradeData.user];
              console.log(
                `[STORE] ${userName} ${tradeData.is_buy ? "BUY" : "SELL"}: ${
                  (event.sol_amount).toFixed(4)
                } SOL of ${event.name}`
              );
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
        console.log("[INFO] Non-42 message:", message);
      }
    });

    ws.on('close', () => {
      if (ENABLE_LOGS) {
        console.log(`[CLOSE] Disconnected from ${uri}, reconnecting in 5s...`);
      }
      setTimeout(connect, 5000);
    });

    ws.on('error', (err: Error) => {
      if (ENABLE_LOGS) {
        console.log(`[ERROR] WebSocket error on ${uri}:`, err);
      }
      ws.close();
    });
  }

  connect();
}

/**
 * Subscribes to both the v2 and v3 endpoints.
 */
function pumpFunListener() {
  // Connect to v2
  connectToSocket("wss://frontend-api-v2.pump.fun/socket.io/?EIO=4&transport=websocket");

  // Connect to v3
  connectToSocket("wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket");
}

pumpFunListener();

// Express server
import express from 'express';
const app = express();

app.get('/api/trades', (req, res) => {
  // Return last 20 trades from each array
  res.json({
    buys: buy_events.slice(-20),
    sells: sell_events.slice(-20),
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`[INFO] Web server running on port ${port}`);
});
