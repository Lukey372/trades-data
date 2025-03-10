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
  sol_amount: number;  // Store as a number to avoid repeated string parsing
  name: string;
  timestamp: number;   // Keep raw timestamp for speed; format only if needed
  mint: string | null;
  usd_market_cap: number | null;
}

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

// We’ll store only the most recent trades. 
// Using push + shift so we don’t do expensive unshift operations each time.
const buy_events: TradeEvent[] = [];
const sell_events: TradeEvent[] = [];

// Maximum number of trades to keep in memory per array.
const MAX_TRADES = 50;

// If you want minimal logs, set this to false or use a separate debug environment variable.
const ENABLE_LOGS = false;

function pumpFunListener(): void {
  const uri = "wss://frontend-api-v2.pump.fun/socket.io/?EIO=4&transport=websocket";

  function connect(): void {
    const ws = new WebSocket(uri);

    ws.on('open', () => {
      if (ENABLE_LOGS) console.log("Connected");
      // Send the "40" message for Socket.IO authorization.
      ws.send("40");
    });

    ws.on('message', (data: RawData) => {
      const message = typeof data === 'string' ? data : data.toString();

      // Respond to pings
      if (message === "2") {
        ws.send("3");
        return;
      }

      // Process messages that start with "42"
      if (message.startsWith("42")) {
        // Attempt to parse the payload
        try {
          const payload = JSON.parse(message.substring(2));
          if (payload[0] === "tradeCreated") {
            const tradeData: TradeData = payload[1];

            // Check if the user is recognized in our map
            if (!USER_MAP[tradeData.user]) {
              // If logs are enabled, you could do a minimal log or skip entirely:
              if (ENABLE_LOGS) {
                console.log(`[SKIP] Unknown user: ${tradeData.user}`);
              }
              return;
            }

            // Convert the trade into our simplified structure
            const event: TradeEvent = {
              user: tradeData.user,  // keep raw address (friendly name can be used in UI)
              sol_amount: tradeData.sol_amount / 1_000_000_000,
              name: tradeData.name,
              timestamp: tradeData.timestamp, // keep numeric
              mint: tradeData.mint || null,
              usd_market_cap: tradeData.usd_market_cap || null,
            };

            // Insert into buy or sell array
            if (tradeData.is_buy) {
              buy_events.push(event);
              // If we exceed MAX_TRADES, remove oldest
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
            console.log("Unknown Response:", payload);
          }
        } catch (err) {
          if (ENABLE_LOGS) {
            console.log("Error parsing message:", err);
          }
        }
      } else if (ENABLE_LOGS) {
        console.log("Unknown message:", message);
      }
    });

    // On close, attempt to reconnect
    ws.on('close', () => {
      if (ENABLE_LOGS) {
        console.log("WebSocket closed. Reconnecting in 5s...");
      }
      setTimeout(connect, 5000);
    });

    // On error, close and reconnect
    ws.on('error', (err: Error) => {
      if (ENABLE_LOGS) {
        console.log("WebSocket error:", err);
      }
      ws.close();
    });
  }

  connect();
}

pumpFunListener();

// Express server to serve the trades
const app = express();

// Return the last 20 trades from each array
app.get('/api/trades', (req, res) => {
  // If you need them in newest-first order, you can reverse or slice differently
  // or let the front end handle ordering.
  res.json({
    buys: buy_events.slice(-20),
    sells: sell_events.slice(-20),
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Web server running on port ${port}`);
});
