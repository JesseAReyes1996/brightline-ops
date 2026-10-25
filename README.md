## How to run

Requires Node.js 22.12 or later on an even-numbered release line (22, 24, or 26); Node 24 is recommended and is what the app was tested on. The test runner doesn't support Node 23 or 25.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local env file from the example, then set `ANTHROPIC_API_KEY` in it:

   ```bash
   cp .env.example .env.local          # macOS / Linux / Git Bash
   Copy-Item .env.example .env.local   # Windows PowerShell
   ```

   `.env.local` is gitignored. The variables:

   - `ANTHROPIC_API_KEY`: used for AI triage. If it's left empty the app still runs, and each request's AI triage is marked failed with the reason "no API key configured".
   - `ANTHROPIC_MODEL` (optional): the Claude model used for triage. Defaults to `claude-haiku-5-5`.
   - `MONGODB_URI` (optional): a MongoDB to use instead of the automatic in-memory one (see **Database** below).
   - `SITE_PASSWORD` (optional): when set, every page and API route asks for this password through the browser's sign-in prompt (HTTP Basic Auth, any username). Leave it empty for local development.

3. Start the dev server and open http://localhost:3000:

   ```bash
   npm run dev
   ```

   - **First start takes about a minute:** without `MONGODB_URI`, the dev server downloads a MongoDB binary (up to ~800 MB, first run only, progress shown in the terminal) as soon as it boots. Setting `MONGODB_URI` skips the download.
   - **Database:** if `MONGODB_URI` is set in `.env.local`, the app uses that MongoDB (database `brightline`). If it isn't set, an in-memory MongoDB starts automatically and its data resets each time the dev server stops.
   - **Demo data:** when the server starts and finds the database empty, it seeds demo users and sample requests. See [Resetting the demo data](#resetting-the-demo-data).
   - **Identity:** there's no real login. Use the **Viewing as** dropdown in the header to act as any seeded user (Priya is the Ops Lead; Marcus, Dana, Luis, Hannah, and Theo are Ops; Sam, Alex, Jordan, and Morgan are requesters).

4. Run the unit tests (no database or API key needed):

   ```bash
   npm test
   ```

### Using a different API key or model

Both are read from `.env.local`. The dev server reloads that file when it changes, so new values apply from the next request; restarting `npm run dev` also works.

- **API key:** replace the value of `ANTHROPIC_API_KEY`.
- **Model:** set `ANTHROPIC_MODEL` to any Claude model ID, for example `ANTHROPIC_MODEL=claude-sonnet-5-5`. If unset, it defaults to `claude-haiku-5-5`.

### Resetting the demo data

The app checks for an empty database only when a server starts, then reuses that connection. Emptying the database while the app is running doesn't reseed it until a new server starts.

- **Local, default in-memory database:** restart `npm run dev`. The data resets on every restart.
- **Local, your own `MONGODB_URI`:** delete the `users` and `requests` collections in the `brightline` database, then restart `npm run dev`.
- **Hosted on Vercel:** delete the `users` and `requests` collections in Atlas, then redeploy the latest deployment in Vercel so fresh server instances start and seed.
