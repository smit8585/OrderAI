# OrderAI

When a new order arrives in Shiprocket, OrderAI checks the delivery address. If it is ambiguous, a voice agent calls the customer, confirms the order, gets the full address, and updates Shiprocket.

## What works now
- Orders dashboard modelled on Shiprocket's order list, with an address flag (valid / ambiguous) and a **Start call** button per order.
- Address flag: read from Shiprocket's order data when present (field name unconfirmed, see `src/domain/address.ts`), otherwise OrderAI's own check.
- Voice call in the browser (hands-free, English or Hindi) following the script in `src/domain/agent.ts`. Result, transcript and summary land under Calls.
- Corrected address is written to Shiprocket (`POST /v1/external/orders/address/update`) by button, or automatically if enabled in Settings.
- Sample orders to try everything before connecting anything.

## Not done yet
- Inferex realtime voice agent (WebSocket) in place of the browser engine.
- Phone calls (needs a telephony link in front of the voice agent).
- Triggering the call automatically when an order is placed.
- Confirming the Shiprocket address-flag field name and the address-update behaviour on a live account.

## Deploy (Railway)
Postgres plugin + this repo. Variables: `DATABASE_URL`, `SESSION_SECRET` (32+ chars), `APP_PIN`, `APP_URL`. Migrations run on start.

## Develop
`npm install`, copy `.env.example` to `.env`, `npm run db:migrate`, `npm run dev`. Tests: `npm test`.
