import asyncio
import json
from datetime import datetime

import websockets


async def main():
    async with websockets.connect("wss://frontend-api-v2.pump.fun/socket.io/?EIO=4&transport=websocket") as websocket:
        # Receive the initial message
        response = await websocket.recv()
        if response[0] == "0":
            print("Connected")

        # Send the "40" message
        await websocket.send("40")
        response = await websocket.recv()
        if response[0:2] == "40":
            print("Authorized")

        # Keep the connection open and print incoming messages
        while True:
            try:
                response = await websocket.recv()
                if response == "2":
                    await websocket.send("3")
                else:
                    response_json = json.loads(response[2:])
                    if response_json[0] == "tradeCreated":
                        trade_data = response_json[1]
                        print(trade_data)
                        print(f"User: {trade_data['user']} {'Bought' if trade_data['is_buy'] else 'Sold'} {trade_data['sol_amount'] / 1000000000} SOL worth "
                              f"of {trade_data['name']} at {datetime.fromtimestamp(trade_data['timestamp'])}")
                    else:
                        print("Unknown Response")

            except websockets.ConnectionClosed:
                print("WebSocket connection closed")
                break

# Run the async function
asyncio.run(main())
