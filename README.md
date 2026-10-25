## How to run

Requires Node.js 22.12 or later (Node 24 recommended).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file from the example, then set `ANTHROPIC_API_KEY` in it:

   ```bash
   cp .env.example .env.local          # macOS / Linux / Git Bash
   Copy-Item .env.example .env.local   # Windows PowerShell
   ```

   `.env.local` is gitignored. If `ANTHROPIC_API_KEY` is left empty the app still runs, and each request's AI triage is marked failed with the reason "no API key configured".

3. Start the dev server and open http://localhost:3000:

   ```bash
   npm run dev
   ```

   - **First start takes about a minute:** without `MONGODB_URI`, the dev server downloads a MongoDB binary (up to ~800 MB, first run only, progress shown in the terminal) as soon as it boots. Setting `MONGODB_URI` skips the download.
   - **Database:** if `MONGODB_URI` is set in `.env.local`, the app uses that MongoDB (database `brightline`). If it isn't set, an in-memory MongoDB starts automatically and its data resets each time the dev server stops.
   - **Demo data:** when the server starts and finds the database empty, it seeds demo users and sample requests. See [Resetting the demo data](#resetting-the-demo-data).
   - **Identity:** there's no real login. Use the **Viewing as** dropdown in the header to act as any seeded user (Priya is the Ops Lead; Marcus, Dana, Luis, Hannah, and Theo are Ops; Sam, Alex, Jordan, and Morgan are requesters).

4. Run the unit tests:

   ```bash
   npm test
   ```

### Using a different API key or model

Both are read from `.env.local` when the dev server starts, so restart `npm run dev` after changing them.

- **API key:** replace the value of `ANTHROPIC_API_KEY`.
- **Model:** set `ANTHROPIC_MODEL` to any Claude model ID, for example `ANTHROPIC_MODEL=claude-sonnet-5-5`. If unset, it defaults to `claude-haiku-5-5`.

### Resetting the demo data

The app checks for an empty database only when a server starts, then reuses that connection. Emptying the database while the app is running doesn't reseed it until a new server starts.

- **Local, default in-memory database:** restart `npm run dev`. The data resets on every restart.
- **Local, your own `MONGODB_URI`:** delete the `users` and `requests` collections in the `brightline` database, then restart `npm run dev`.
- **Hosted on Vercel:** delete the `users` and `requests` collections in Atlas, then redeploy the latest deployment in Vercel so fresh server instances start and seed.
