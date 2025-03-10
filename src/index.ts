import express from 'express';
import WebSocket, { RawData } from 'ws';

interface TradeEvent {
  user: string;
  sol_amount: string;
  name: string;
  timestamp: string;
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
};

const buy_events: TradeEvent[] = [];
const sell_events: TradeEvent[] = [];

// WebSocket listener function
function pumpFunListener(): void {
  const uri = "wss://frontend-api-v2.pump.fun/socket.io/?EIO=4&transport=websocket";

  function connect(): void {
    const ws = new WebSocket(uri);

    ws.on('open', () => {
      console.log("Connected to pump.fun feed");
      ws.send("40");
    });

    ws.on('message', (data: RawData) => {
      const message: string = typeof data === 'string' ? data : data.toString();
      if (message === "2") {
        ws.send("3");
        return;
      }
      if (message.startsWith("42")) {
        try {
          const payload = JSON.parse(message.substring(2));
          if (payload[0] === "tradeCreated") {
            const tradeData = payload[1];
            const userAddress: string = tradeData.user;
            if (USER_MAP[userAddress]) {
              const friendlyUser = USER_MAP[userAddress];
              const solAmount = tradeData.sol_amount / 1_000_000_000;
              const coinName = tradeData.name;
              const isBuy = tradeData.is_buy;
              const ts = new Date(tradeData.timestamp * 1000);
              const event: TradeEvent = {
                user: friendlyUser,
                sol_amount: solAmount.toFixed(4),
                name: coinName,
                timestamp: ts.toISOString().replace('T', ' ').substring(0, 19),
                mint: tradeData.mint || null,
                usd_market_cap: tradeData.usd_market_cap || null,
              };

              if (isBuy) {
                buy_events.unshift(event);
                if (buy_events.length > 50) {
                  buy_events.pop();
                }
              } else {
                sell_events.unshift(event);
                if (sell_events.length > 50) {
                  sell_events.pop();
                }
              }
              console.log(`[Trade] ${friendlyUser} ${isBuy ? 'bought' : 'sold'} ${solAmount.toFixed(4)} SOL of ${coinName}`);
            } else {
              console.log(`Skipped trade from unknown address: ${userAddress}`);
            }
          } else {
            console.log("Unknown event:", payload);
          }
        } catch (e) {
          console.log("Error parsing message:", e);
        }
      } else {
        console.log("Unknown message:", message);
      }
    });

    ws.on('close', () => {
      console.log("WebSocket connection closed. Reconnecting in 5 seconds...");
      setTimeout(connect, 5000);
    });

    ws.on('error', (err: Error) => {
      console.log("WebSocket error:", err);
      ws.close();
    });
  }

  connect();
}

pumpFunListener();

const app = express();

app.get('/api/trades', (req, res) => {
  res.json({
    buys: buy_events.slice(0, 20),
    sells: sell_events.slice(0, 20)
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
