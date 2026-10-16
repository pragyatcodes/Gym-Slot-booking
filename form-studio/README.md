# FORM Movement Studio

Full-stack gym slot booking: register and log in, browse hourly sessions, book or waitlist, cancel, and (as staff) create sessions, view rosters, and check members in.

This implementation was **AI-assisted**. If your brief says “No AI”, do not submit it as unaided work.

## Demo accounts

Password for all of these: `DemoPass123!`

| Role | Email |
| --- | --- |
| Member | `alex@form.studio` |
| Member | `jamie@form.studio` |
| Admin | `admin@form.studio` |

First visit auto-signs in as Alex. Use the top-right logout icon, then **Member demo** / **Admin demo**, or register a new account.

## Run locally

Python 3.11+ (tested on 3.13). No database server and no frontend build are required to run — compiled UI assets are already in `static/`.

```sh
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open [http://localhost:3000](http://localhost:3000).

Optional environment variables (see `.env.example`; the app does not load `.env` by itself):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `gym.sqlite3` | SQLite file |

A new database is created and seeded on first start. Delete `gym.sqlite3` (and `-wal`/`-shm` files) to reset demo data.

### Rebuild UI assets (only if you edit React/TypeScript)

```sh
npm install
npm run build
```

That writes `static/calendar-assets/`. Render does **not** need Node if you commit those files.

## Upload to GitHub

1. Create an **empty** repository (no README / license / .gitignore).
2. From this project folder:

```sh
git init
git add .
git commit -m "Add FORM Movement Studio"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Or restore the included history:

```sh
git clone history.bundle ../form-studio-repo
cd ../form-studio-repo
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Do not commit `.env`, `gym.sqlite3`, `.venv/`, or `node_modules/`.

## Deploy on Render

**Root Directory:** `form-studio` if the GitHub repo contains that folder; leave blank if `app.py` is at the repo root.

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Build | `pip install -r requirements.txt` |
| Start | `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 60 wsgi:app` |
| Env `PYTHON_VERSION` | `3.13.5` |
| Env `DATABASE_PATH` | `/tmp/gym.sqlite3` (free demo; data can reset) |

Do **not** set `PORT`. Paid Blueprint (`render.yaml`) uses a disk at `/var/data` and `DATABASE_PATH=/var/data/gym.sqlite3` so bookings survive restarts — review Render pricing first.

## What you can do

- Register (unique email, hashed password) and log in with a server token
- Browse sessions by date; book if a mat is free; join a FIFO waitlist when full
- One active booking per member per session; cancel or rebook future sessions only
- Waitlist promotion on cancellation (transactional, capacity 20)
- Check-in codes; admin consumes a code once during the session hour
- Admin: create hourly sessions, roster, check-in
- Dark UI, glass calendar, metallic actions, expanding profile card, custom cursor

## Design note

1. Flask serves the JSON API and the SPA from one origin.
2. SQLite stores users, hashed tokens, sessions and bookings.
3. Passwords use scrypt; tokens are SHA-256 digests, 7-day expiry.
4. Unique session start times; capacity 20 enforced in the database.
5. One active booking or waitlist row per member per session.
6. `BEGIN IMMEDIATE` plus triggers guard the last seat.
7. Cancel + FIFO promotion commit together.
8. Live polling every 5s; the server remains the source of truth.

Times are **Asia/Kolkata (IST)**. Admins are seeded, never registered.

## Tests

```sh
python -m unittest discover -s tests -v
```

## Layout

```
app.py                 Flask API, schema, seed
wsgi.py                Production entry (Gunicorn)
requirements.txt       Flask, Gunicorn
static/                SPA, theme, images, compiled React
components/ui/         shadcn-style React (calendar, buttons, profile, cursor)
frontend/              Vite mount
render.yaml            Optional paid Render Blueprint
```

Demo credentials are public and not production secrets. Remove auto-login and rotate accounts before any real gym use.
