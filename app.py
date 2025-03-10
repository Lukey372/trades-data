import asyncio
import json
import threading
from datetime import datetime

from flask import Flask, jsonify
import websockets

###############################################################################
# 1) Address → Friendly Name Mapping
###############################################################################
USER_MAP = {
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
}

###############################################################################
# 2) In-memory storage for Buy & Sell events
###############################################################################
buy_events = []
sell_events = []

###############################################################################
# 3) WebSocket listener to populate buy/sell lists
###############################################################################
async def pump_fun_listener():
    """
    Connects to the pump.fun trade feed (Socket.IO),
    listens for 'tradeCreated' events, and updates buy_events / sell_events.
    """
    uri = "wss://frontend-api-v2.pump.fun/socket.io/?EIO=4&transport=websocket"

    while True:
        try:
            async with websockets.connect(uri) as ws:
                # 1) Receive initial message (should start with '0')
                initial_msg = await ws.recv()
                if initial_msg.startswith("0"):
                    print("Connected to pump.fun feed")

                # 2) Send '40' to authenticate
                await ws.send("40")
                auth_msg = await ws.recv()
                if auth_msg.startswith("40"):
                    print("Authorized to trade room")

                # 3) Listen for tradeCreated events
                while True:
                    msg = await ws.recv()

                    # Handle Socket.IO pings
                    if msg == "2":
                        # Respond with "3"
                        await ws.send("3")
                        continue

                    # Socket.IO data often starts with "42" before the JSON
                    if msg.startswith("42"):
                        data = json.loads(msg[2:])
                        if data[0] == "tradeCreated":
                            trade_data = data[1]

                            user_address = trade_data["user"]
                            friendly_user = USER_MAP.get(user_address, user_address)
                            sol_amount = trade_data["sol_amount"] / 1_000_000_000
                            coin_name = trade_data["name"]
                            is_buy = trade_data["is_buy"]
                            ts = datetime.fromtimestamp(trade_data["timestamp"])

                            event = {
                                "user": friendly_user,
                                "sol_amount": f"{sol_amount:.4f}",
                                "name": coin_name,
                                "timestamp": ts.strftime("%Y-%m-%d %H:%M:%S")
                            }

                            if is_buy:
                                buy_events.insert(0, event)
                                # Keep only the 50 most recent
                                if len(buy_events) > 50:
                                    buy_events.pop()
                            else:
                                sell_events.insert(0, event)
                                # Keep only the 50 most recent
                                if len(sell_events) > 50:
                                    sell_events.pop()

                            print(f"[Trade] {friendly_user} "
                                  f"{'bought' if is_buy else 'sold'} {sol_amount:.4f} SOL of {coin_name}")
                        else:
                            print("Unknown event:", data)
                    else:
                        print("Unknown message:", msg)

        except websockets.ConnectionClosed:
            print("WebSocket connection closed. Will attempt reconnect in 5 seconds...")
            await asyncio.sleep(5)
        except Exception as e:
            print("Error in listener:", e)
            await asyncio.sleep(5)


def run_listener_forever():
    """
    Run pump_fun_listener in a dedicated event loop (in a thread) so Flask can run separately.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(pump_fun_listener())

###############################################################################
# 4) Flask app with JSON endpoint for tilt.wtf
###############################################################################
app = Flask(__name__)

@app.route("/api/trades")
def get_trades():
    """
    Return the most recent buy/sell trades as JSON.
    Your tilt.wtf front-end can fetch this endpoint and display data accordingly.
    """
    return jsonify({
        "buys": buy_events[:20],   # Return top 20
        "sells": sell_events[:20], # Return top 20
    })

###############################################################################
# 5) Main entry point
###############################################################################
if __name__ == "__main__":
    # Start the WebSocket listener in a background thread
    t = threading.Thread(target=run_listener_forever, daemon=True)
    t.start()

    # Run Flask in the main thread
    app.run(host="0.0.0.0", port=5000, debug=True)
