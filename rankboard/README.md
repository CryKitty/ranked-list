# Rankboard

`Rankboard` is a Trello-inspired web app for ranking games, movies, shows, waifus, and anything else that works better as a draggable list than a spreadsheet.

## What It Does Today

- Drag cards inside and across columns.
- Auto-number ranked columns based on card position.
- Store a title, series label, and big background image or GIF URL on each card.
- Filter the board by search term or series.
- Import a Trello board from exported JSON.
- Save board state automatically in browser local storage.
- Mirror yearly game entries into the `Favorites Of All Time` column automatically.

## Stack

- `Next.js` for the frontend.
- `@dnd-kit` for drag and drop.
- `Supabase` for auth, Postgres, and storage once configured.
- `RAWG` optionally for better automatic game artwork lookups.
- `Vercel` for deployment.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Trello Import

1. Open your Trello board.
2. Export the board as JSON from Trello.
3. In Rankboard, click `Import Trello JSON`.
4. Choose the exported file.

The import currently maps Trello lists to columns and Trello cards to Rankboard cards, including card descriptions and image attachments when present.

## Supabase Setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Optional: add `NEXT_PUBLIC_RAWG_API_KEY` for improved automatic game artwork results.
5. Run the SQL in [supabase/schema.sql](/Users/avarycooney/Documents/Playground/rankboard/supabase/schema.sql) in the Supabase SQL editor.

Until those environment variables are set, the app saves locally in the browser on the current device. Supabase is still the path for account-based syncing across devices and users.

## Free Deployment Path

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add the same Supabase environment variables in Vercel.
4. Deploy.

That gives you a public URL, responsive frontend, and a path to logins and persisted rankings while staying on the free tiers to start.
