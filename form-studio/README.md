# FORM — Gym Slot Booking

A working full-stack booking system for a small movement studio. Responsive member dashboard, registration/login, personal bookings and check-in codes, plus a staff console for sessions, rosters and attendance.

> **Challenge disclosure:** This implementation was AI-assisted. The supplied challenge says “No AI”; do not represent this work as an unaided submission. Review, understand and adapt it in line with your evaluator’s rules.

## Deployment package

See [DEPLOY.md](DEPLOY.md) for Windows/macOS/Linux setup, GitHub upload commands, restoring the included Git history bundle, and Render deployment. `render.yaml` configures a paid web service with persistent SQLite storage; review costs before approving. `wsgi.py` is the production entry point.

## Run locally

Requires Python 3.11+ (tested with 3.13). No JavaScript build step, external database server or secret signing key is required.

```sh
cd gym
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:3000`. The server listens on `0.0.0.0`, supports client-side route fallback, and serves the API and frontend from the same origin.

`PORT` and `DATABASE_PATH` are optional environment variables; see `.env.example`. Set/export them in your shell (the app does not automatically source `.env`). Defaults: port 3000 and `gym.sqlite3` alongside `app.py`. A new database is automatically created and seeded. Data persists across server restarts. To reset the demo, stop the server and delete `gym.sqlite3` and any `gym.sqlite3-wal`/`gym.sqlite3-shm` files, then restart.

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Member | alex@form.studio | DemoPass123! |
| Member | jamie@form.studio | DemoPass123! |
| Admin | admin@form.studio | DemoPass123! |

On the first non-auth visit, the **demo frontend explicitly signs in as Alex**, and labels the account as demo. Sign out using the arrow at the top right to use login, registration, or the one-click member/admin demo buttons. `/login` and `/register` do not trigger first-visit demo login. Automatic demo login is a presentation convenience in `boot()` in `static/app.js`, not an API authentication bypass. Every API data request still requires a valid server-issued token.

The seed includes 42 hourly sessions over seven days starting on the server’s current date, a full Pilates session each day, varied occupancy, two named members, an admin, and 20 supporting demo members. A current-hour open-studio session is added if needed. Alex has an upcoming booking; when there is space, Alex also has a booking in the current hour for testing attendance. Seed credentials are public demonstration credentials, **not production secrets**.

## Try the flow

1. Open Sessions, select tomorrow, and book a mat. The remaining count changes before the request finishes; failures roll it back.
2. Open My bookings to see the server-generated check-in code.
3. Join a full Pilates session. My bookings shows your queue position.
4. To demonstrate promotion with two browsers, sign in as `member1@form.studio` (same demo password) in a separate browser profile and cancel their booking in that same full session. The oldest waitlisted member is promoted transactionally, receives a code, and sees the update within five seconds.
5. Switch to the admin demo. Select a session to view its full roster. Create a future hourly session, or check in a confirmed code from the currently running session. Any current-session member’s code can be copied from the admin roster for this demo.
6. Try reusing the code, checking in early, booking twice or opening `/admin` as a member. Both the interface and API enforce the relevant rules.

## Design note (8 lines)

1. Flask serves a JSON API and a vanilla JavaScript SPA from one origin, avoiding a separate frontend build or CORS layer.
2. SQLite is a real relational database with users, tokens, sessions and bookings linked by foreign keys.
3. Passwords use Werkzeug scrypt; random bearer tokens are stored as SHA-256 digests and expire after seven days.
4. Sessions have unique start times and a database-enforced capacity of exactly 20.
5. A partial unique index allows only one active booking/waitlist record per member per session, retaining cancellation history.
6. `BEGIN IMMEDIATE` serializes competing writers; capacity triggers provide an additional database-level guardrail.
7. Cancellation and FIFO promotion commit together, and attendance updates are also atomic.
8. Five-second polling synchronizes seats, personal bookings and rosters; optimistic UI never replaces server authority.

## Assumptions

- The gym operates in **Asia/Kolkata (IST)**. All stored timestamps are naive local ISO-8601 strings in this single, DST-free time zone. The UI displays wall-clock session times, with “All times IST” in the footer. The server’s clock determines booking, cancellation and check-in boundaries.
- Capacity is always 20; clients cannot change it. Sessions start exactly on the hour and last 60 minutes. There is one studio, so only one session can start at a given hour.
- Admins manage sessions but do not book as members. Registration ignores requested role fields and always creates a member. Admins are created by the database seed, never through registration.
- One active booking means either confirmed or waitlisted. A cancelled member can rebook, receiving a new record and code. Rejoining a waitlist goes to its end.
- If a mat opens before a waitlist request reaches the server, the request confirms the member instead. If the last mat disappears before a normal booking request, the server returns 409 so the member can explicitly choose to waitlist.
- Cancelling confirmed bookings promotes the oldest active waitlist record by monotonically increasing booking ID. Leaving a waitlist does not promote anyone. Booking and cancellation are prohibited at or after the start, so promotion cannot occur after the start either.
- Check-in codes are eight cryptographically random characters, excluding ambiguous characters, with a database uniqueness constraint. Codes are visible only to their owner and admin rosters. Cancelled codes are invalidated.
- The check-in interval includes the start and excludes the end. “Past” in My bookings includes sessions that have already started, including those still in progress; their codes remain visible.
- Members may book multiple distinct hours. There are no fees, quotas, cancellation penalties or email notifications. Automatic promotion notifications appear in the live app.
- Session titles, instructors and movement types are optional presentation metadata beyond the brief. The backend validates all supplied text lengths. Unknown form properties cannot override role, capacity, ownership, booking status or code.
- Dates with no sessions display a useful empty state. Today’s bookable sessions are listed before sessions already started. A calendar input on wider screens and a seven-day selector support date filtering.

## API

All non-public endpoints require a valid server-issued token via `Authorization: Bearer <token>` or the preview-compatible `X-Form-Token: <token>` header. The browser supplies both; when present, the studio-specific header takes precedence so proxy credentials cannot replace the application identity. Every error has one shape:

```json
{"error":{"message":"A readable explanation."}}
```

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/register` | Public | Name, email, password; returns user and token (201) |
| POST | `/api/login` | Public | Email/password; returns user and token |
| GET | `/api/me` | Authenticated | Current user and gym-local server time |
| POST | `/api/logout` | Authenticated | Revoke current token |
| GET | `/api/sessions?date=YYYY-MM-DD` | Authenticated | Sessions, remaining seats and own active booking |
| POST | `/api/sessions` | Admin | Create a future session using `starts_at`, `title`, `coach`, `kind` (201) |
| POST | `/api/sessions/:id/book` | Member | Reserve or join queue with `{"waitlist":true}` (201) |
| GET | `/api/bookings` | Authenticated | Only the caller’s bookings, codes and queue positions |
| DELETE | `/api/bookings/:id` | Owning member | Cancel or leave queue; promote atomically if needed |
| GET | `/api/admin/sessions/:id/bookings` | Admin | Full roster including cancellations and attendance |
| POST | `/api/admin/checkin` | Admin | Single-use attendance using `{"code":"ABCDEFGH"}` |

Invalid input: 400; unauthenticated: 401; wrong role/ownership: 403; missing resource: 404; booking, capacity, time or uniqueness conflict: 409. A global handler converts unexpected errors to a generic JSON 500 without exposing stack traces. Server logs retain diagnostics.

## Tests

```sh
python -m unittest discover -s tests -v
```

Eleven integration tests use isolated real SQLite databases and the Flask API, covering:

- Unique case-normalized email, hashed passwords and role escalation prevention.
- Authentication, logout revocation, admin protection and member ownership.
- Five simultaneous requests racing for the last mat: exactly one succeeds and occupancy stays at 20.
- Full sessions, duplicate bookings, FIFO promotion, queue positions, leaving/rejoining, cancellation and rebooking.
- Check-in boundaries, cancelled codes and code reuse.
- Server-side time validation, conflicting session times and consistent errors.

The frontend was also exercised in Chromium at desktop and 360px: initial demo login, booking, viewing codes, confirmation/cancellation, sign-out and admin demo login. No horizontal overflow was found at 360px. API tests cover temporal edge cases with a controlled clock; changing your browser clock never changes the API rules.

## Repository & files

```text
app.py                  API, schema, seeding, authentication and business rules
static/index.html       SPA entry point
static/app.js           Router, member/admin screens, polling, validation, optimistic UI
static/style.css        Responsive studio design
static/studio.jpg       AI-generated studio illustration
requirements.txt        Runtime Python dependency
.env.example            Optional environment configuration
.gitignore              Excludes database, caches, installed dependencies and secrets
 tests/test_api.py      Database-backed integration tests
```

A local Git repository includes incremental implementation commits. No remote repository was supplied, so nothing has been pushed and no repository URL is claimed. Add your own remote and push after reviewing the code and the challenge’s AI restriction.

## Production limitations

This is a functioning challenge/demo implementation, not a production service. Before public deployment: remove automatic demo login and public demo/admin credentials; provision real admins; use HTTPS and a production WSGI server; add rate limiting to login, registration and code lookup; introduce CSRF protection if switching to cookies; consider HttpOnly cookie sessions instead of tokens in localStorage to reduce XSS token exposure; add backups, structured monitoring and schema migrations. SQLite is appropriate for this single-instance studio; multiple API replicas would need a coordinated shared database, e.g. PostgreSQL with row locks. Polling is deliberately used instead of WebSockets. The visual fonts are loaded from Google Fonts with local sans-serif fallback; all functional assets are served locally.

## Demo login / embedded-preview regression fix

Client-side navigation uses hash routes (`#/sessions`, `#/admin`) so role switches do not change the preview's document path. Existing `/login`, `/register`, `/admin` and `/sessions` entry URLs are still understood. Demo buttons explicitly use `type="button"`, prevent default navigation, disable competing sign-in actions while pending, and show errors inline. Browser storage access has an in-memory fallback so privacy-restricted embedded browsers can still sign in; in that fallback mode, authentication lasts until the document is reloaded. A stale request's 401 cannot sign out a newly selected account.

With the server running, `node tests/demo_login.cjs` tests both demo roles, icon clicks, zero document reloads during switching, back navigation, persisted admin login, and browsers that deny both localStorage and sessionStorage. Install Playwright for this optional browser test: `npm install --no-save playwright && npx playwright install chromium`.


### Authentication transport fix
The preview logs showed a successful POST `/api/login` (200) immediately followed by GET `/api/sessions` and `/api/bookings` returning 401. To support proxies that consume or replace Authorization, the frontend now also sends the opaque token as `X-Form-Token`; authentication and logout use the same extraction function. This is not an authorization bypass: hashes, expiry, roles, ownership and revocation are checked exactly as before. HTML, JavaScript and API responses use `Cache-Control: no-store`, and the script version is bumped to prevent stale code. Browser regression tests now run four combinations of normal/blocked storage and preserved/stripped Authorization headers. All four pass, and the API regression verifies custom-header role checks, invalid-token rejection and revocation.
