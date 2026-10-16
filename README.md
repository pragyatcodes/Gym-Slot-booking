# FORM Movement Studio — Gym Slot Booking

**Repository:** https://github.com/pragyatcodes/Gym-Slot-booking  

Working booking app for a small studio: register/login, browse hourly sessions, book or join a waitlist, cancel, automatic FIFO promotion, check-in codes, and an admin console (create sessions, roster, check-in).

This project was **AI-assisted**

The runnable app is in the `form-studio/` folder. On Render, set **Root Directory** to `form-studio`.

---

## Setup

**Need:** Python 3.11 or newer.

```sh
cd form-studio
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:3000

Config uses **environment variables** only (no secrets in git). Copy `.env.example` if you want a local reminder. The app does **not** auto-load `.env` — export vars in your shell or set them on Render.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `gym.sqlite3` | SQLite file (created and seeded on first run) |

Do not commit `.env` or `gym.sqlite3`. `.gitignore` already ignores them.

Reset demo data: stop the server and delete `gym.sqlite3` (and `-wal` / `-shm` if present).

**Render** https://gym-slot-booking-48wx.onrender.com/
---

## Admin / member test credentials

Password for **all** accounts: `DemoPass123!`

| Role | Email |
| --- | --- |
| Member | `alex@form.studio` |
| Member | `jamie@form.studio` |
| Member (waitlist tests) | `member1@form.studio` |
| Admin | `admin@form.studio` |

First visit auto-signs in as Alex. Log out (top-right arrow), then use **Member demo** / **Admin demo**, or register a new **member**. You cannot register as admin; admin is seeded only.

These are public demo accounts for marking, not production secrets.

---

## Stack / data-model note (10 lines)

1. Flask serves a JSON API and a vanilla JS SPA from one origin (no CORS split).
2. SQLite stores users, hashed login tokens, sessions and bookings with foreign keys.
3. Passwords use Werkzeug scrypt; opaque tokens are stored as SHA-256 digests (7-day expiry).
4. Sessions are unique on-the-hour 60-minute slots; capacity is always 20 (database trigger).
5. A partial unique index allows only one active booking or waitlist row per member per session.
6. `BEGIN IMMEDIATE` serializes last-seat races; confirmed count cannot exceed 20.
7. Cancel and FIFO waitlist promotion commit in one transaction; no promotion after start.
8. Check-in codes are random, unique, one-use, and valid only during the session hour.
9. Auth uses `Authorization: Bearer` and/or `X-Form-Token`; members see own bookings, admins see rosters.
10. Five-second polling plus optimistic booking counts; the server remains authoritative.

---

## Assumptions

- Timezone is **Asia/Kolkata (IST)**. Stored times are local ISO-8601 in that zone. The server clock decides book / cancel / check-in.
- One studio, one session per start hour, always 20 mats, always 60 minutes on the hour.
- Registration always creates a **member**. Admins are created only by the seed, never by the register form.
- Admins manage sessions and attendance; they do not book as members in this app.
- One active booking means confirmed **or** waitlisted. After cancel, rebooking is allowed (new row and new code). Rejoining a waitlist goes to the end.
- If a mat frees before a waitlist request arrives, the server confirms. If the last mat is taken before a book request, the API returns 409 so the member can waitlist on purpose.
- Promotion is FIFO by booking id. Leaving a waitlist does not promote anyone. Book/cancel after start is rejected, so promotion cannot happen after start.
- Check-in window includes the start and excludes the end. Codes are 8 unambiguous random characters. Cancelled codes do not work. Owner and admin roster can see codes.
- Members may book different hours. No payments, emails, or quotas.
- Auto-login as Alex is UI-only; every API still needs a real token.

---

## How to try it

1. Open the app as Alex → pick a **future** day → **Book session** → see the code under **My bookings**.
2. Join a **full** Pilates class (waitlist). Position shows on My bookings.
3. Log out → **Admin demo** → create a future session, open a roster, check in a code during the session hour.
4. Confirm rejects: member opening `/admin`, double-book same hour, check-in too early or reuse a code.

Tests: `cd form-studio && python -m unittest discover -s tests -v`
