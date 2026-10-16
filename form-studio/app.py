import os, re, sqlite3, secrets, hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from functools import wraps
from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 16384
DB = os.environ.get(
    "DATABASE_PATH", os.path.join(os.path.dirname(__file__), "gym.sqlite3")
)
TZ = ZoneInfo("Asia/Kolkata")


def now():
    return datetime.now(TZ).replace(tzinfo=None)


def stamp():
    return now().isoformat(timespec="seconds")


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB, timeout=20, isolation_level=None)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(error):
    if "db" in g:
        g.db.close()


class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


@app.errorhandler(APIError)
def api_error(e):
    return jsonify(error={"message": e.message}), e.status


@app.errorhandler(Exception)
def unexpected(e):
    from werkzeug.exceptions import HTTPException

    if isinstance(e, HTTPException):
        return jsonify(error={"message": e.description}), e.code
    app.logger.exception("Request failed")
    return jsonify(error={"message": "Something went wrong. Please try again."}), 500


def request_token():
    # Preview/reverse proxies may consume Authorization for their own auth.
    # Both transports carry the same opaque token, validated against the DB.
    studio_token = request.headers.get("X-Form-Token")
    if studio_token is not None:
        return studio_token
    authorization = request.headers.get("Authorization", "")
    return authorization[7:] if authorization.startswith("Bearer ") else ""


@app.after_request
def prevent_stale_auth_responses(response):
    if request.path.startswith("/api/") or response.mimetype in (
        "text/html", "text/javascript", "application/javascript"
    ):
        response.headers["Cache-Control"] = "no-store"
    return response


def auth(role=None):
    def deco(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            token = request_token()
            user = (
                db()
                .execute(
                    "SELECT u.* FROM users u JOIN tokens t ON u.id=t.user_id WHERE t.digest=? AND t.expires>?",
                    (hashlib.sha256(token.encode()).hexdigest(), stamp()),
                )
                .fetchone()
            )
            if not user:
                raise APIError("Please sign in to continue.", 401)
            g.user = user
            if role and user["role"] != role:
                raise APIError("You do not have permission to do that.", 403)
            return fn(*args, **kwargs)

        return wrapped

    return deco


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIError("A JSON object is required.")
    return data


def public_user(u):
    return {k: u[k] for k in ("id", "name", "email", "role")}


def issue_token(u):
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens VALUES (?,?,?)",
        (
            hashlib.sha256(token.encode()).hexdigest(),
            u["id"],
            (now() + timedelta(days=7)).isoformat(),
        ),
    )
    return jsonify(token=token, user=public_user(u))


@app.post("/api/register")
def register():
    d = body()
    name = d.get("name", "")
    email = d.get("email", "")
    pw = d.get("password", "")
    if not all(isinstance(x, str) for x in (name, email, pw)):
        raise APIError("All fields must be text.")
    name = name.strip()
    email = email.strip().lower()
    if not 2 <= len(name) <= 80:
        raise APIError("Name must be between 2 and 80 characters.")
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise APIError("Enter a valid email address.")
    if not 8 <= len(pw) <= 128:
        raise APIError("Password must be between 8 and 128 characters.")
    try:
        cur = db().execute(
            "INSERT INTO users(name,email,password,role) VALUES (?,?,?,?)",
            (name, email, generate_password_hash(pw), "member"),
        )
    except sqlite3.IntegrityError:
        raise APIError("An account with that email already exists.", 409)
    response = issue_token(
        db().execute("SELECT * FROM users WHERE id=?", (cur.lastrowid,)).fetchone()
    )
    return response, 201


@app.post("/api/login")
def login():
    d = body()
    email = d.get("email", "")
    pw = d.get("password", "")
    if not isinstance(email, str) or not isinstance(pw, str) or len(pw) > 128:
        raise APIError("Enter a valid email and password.")
    u = (
        db()
        .execute("SELECT * FROM users WHERE email=?", (email.strip().lower(),))
        .fetchone()
    )
    if not u or not check_password_hash(u["password"], pw):
        raise APIError("Email or password is incorrect.", 401)
    return issue_token(u)


@app.get("/api/me")
@auth()
def me():
    return jsonify(user=public_user(g.user), server_time=stamp())


@app.post("/api/logout")
@auth()
def logout():
    db().execute(
        "DELETE FROM tokens WHERE digest=?",
        (
            hashlib.sha256(
                request_token().encode()
            ).hexdigest(),
        ),
    )
    return jsonify(ok=True)


def session_data(s):
    s = dict(s)
    s["confirmed"] = (
        db()
        .execute(
            "SELECT count(*) FROM bookings WHERE session_id=? AND status='confirmed'",
            (s["id"],),
        )
        .fetchone()[0]
    )
    s["remaining"] = 20 - s["confirmed"]
    s["waitlist_count"] = (
        db()
        .execute(
            "SELECT count(*) FROM bookings WHERE session_id=? AND status='waitlisted'",
            (s["id"],),
        )
        .fetchone()[0]
    )
    b = (
        db()
        .execute(
            "SELECT * FROM bookings WHERE session_id=? AND user_id=? AND status!='cancelled'",
            (s["id"], g.user["id"]),
        )
        .fetchone()
    )
    s["booking"] = booking_data(b) if b else None
    s["started"] = s["starts_at"] <= stamp()
    return s


def booking_data(b):
    b = dict(b)
    b["position"] = None
    if b["status"] == "waitlisted":
        b["position"] = (
            db()
            .execute(
                "SELECT count(*) FROM bookings WHERE session_id=? AND status='waitlisted' AND id<=?",
                (b["session_id"], b["id"]),
            )
            .fetchone()[0]
        )
    return b


@app.get("/api/sessions")
@auth()
def sessions():
    date = request.args.get("date")
    if date:
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise APIError("Date must be YYYY-MM-DD.")
    rows = (
        db()
        .execute(
            "SELECT * FROM sessions "
            + ("WHERE substr(starts_at,1,10)=? " if date else "")
            + "ORDER BY starts_at",
            (date,) if date else (),
        )
        .fetchall()
    )
    return jsonify(sessions=[session_data(s) for s in rows], server_time=stamp())


@app.post("/api/sessions")
@auth("admin")
def create_session():
    d = body()
    start = d.get("starts_at")
    title = d.get("title", "Open gym")
    coach = d.get("coach", "Studio team")
    kind = d.get("kind", "Strength")
    if not isinstance(start, str):
        raise APIError("A session start time is required.")
    try:
        dt = datetime.fromisoformat(start)
    except ValueError:
        raise APIError("Enter a valid date and hour.")
    if dt.tzinfo or dt.minute or dt.second or dt.microsecond:
        raise APIError("Sessions must start on the hour in gym local time.")
    if dt <= now():
        raise APIError("Sessions must start in the future.")
    if any(
        not isinstance(v, str) or not 1 <= len(v.strip()) <= 80
        for v in (title, coach, kind)
    ):
        raise APIError("Title, coach and type are required (max 80 characters).")
    try:
        cur = db().execute(
            "INSERT INTO sessions(starts_at,title,coach,kind) VALUES (?,?,?,?)",
            (
                dt.isoformat(timespec="seconds"),
                title.strip(),
                coach.strip(),
                kind.strip(),
            ),
        )
    except sqlite3.IntegrityError:
        raise APIError("A session already starts at that time.", 409)
    return (
        jsonify(
            session=session_data(
                db()
                .execute("SELECT * FROM sessions WHERE id=?", (cur.lastrowid,))
                .fetchone()
            )
        ),
        201,
    )


def code():
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))


@app.post("/api/sessions/<int:sid>/book")
@auth("member")
def book(sid):
    d = body()
    wait = d.get("waitlist", False)
    if not isinstance(wait, bool):
        raise APIError("waitlist must be true or false.")
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        s = conn.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if not s:
            raise APIError("Session not found.", 404)
        if s["starts_at"] <= stamp():
            raise APIError("This session has already started.", 409)
        if conn.execute(
            "SELECT 1 FROM bookings WHERE session_id=? AND user_id=? AND status!='cancelled'",
            (sid, g.user["id"]),
        ).fetchone():
            raise APIError("You already have a place in this session.", 409)
        count = conn.execute(
            "SELECT count(*) FROM bookings WHERE session_id=? AND status='confirmed'",
            (sid,),
        ).fetchone()[0]
        if count >= 20 and not wait:
            raise APIError("This session is full. Join the waitlist instead.", 409)
        status = "waitlisted" if count >= 20 else "confirmed"
        cur = conn.execute(
            "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES (?,?,?,?,?)",
            (
                g.user["id"],
                sid,
                status,
                code() if status == "confirmed" else None,
                stamp(),
            ),
        )
        b = booking_data(
            conn.execute(
                "SELECT * FROM bookings WHERE id=?", (cur.lastrowid,)
            ).fetchone()
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return jsonify(booking=b), 201


@app.get("/api/bookings")
@auth()
def bookings():
    rows = (
        db()
        .execute(
            "SELECT b.*,s.starts_at,s.title,s.coach,s.kind FROM bookings b JOIN sessions s ON s.id=b.session_id WHERE b.user_id=? ORDER BY s.starts_at,b.id DESC",
            (g.user["id"],),
        )
        .fetchall()
    )
    return jsonify(bookings=[booking_data(b) for b in rows], server_time=stamp())


@app.delete("/api/bookings/<int:bid>")
@auth("member")
def cancel(bid):
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        b = conn.execute(
            "SELECT b.*,s.starts_at FROM bookings b JOIN sessions s ON s.id=b.session_id WHERE b.id=?",
            (bid,),
        ).fetchone()
        if not b:
            raise APIError("Booking not found.", 404)
        if b["user_id"] != g.user["id"]:
            raise APIError("This booking belongs to another member.", 403)
        if b["starts_at"] <= stamp():
            raise APIError("A session cannot be cancelled after it starts.", 409)
        if b["status"] == "cancelled":
            raise APIError("This booking is already cancelled.", 409)
        conn.execute(
            "UPDATE bookings SET status='cancelled',code=NULL WHERE id=?", (bid,)
        )
        if b["status"] == "confirmed":
            first = conn.execute(
                "SELECT id FROM bookings WHERE session_id=? AND status='waitlisted' ORDER BY id LIMIT 1",
                (b["session_id"],),
            ).fetchone()
            if first:
                conn.execute(
                    "UPDATE bookings SET status='confirmed',code=? WHERE id=?",
                    (code(), first["id"]),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return jsonify(ok=True)


@app.get("/api/admin/sessions/<int:sid>/bookings")
@auth("admin")
def roster(sid):
    if not db().execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone():
        raise APIError("Session not found.", 404)
    rows = (
        db()
        .execute(
            "SELECT b.*,u.name,u.email FROM bookings b JOIN users u ON u.id=b.user_id WHERE session_id=? ORDER BY b.id",
            (sid,),
        )
        .fetchall()
    )
    return jsonify(bookings=[booking_data(b) for b in rows])


@app.post("/api/admin/checkin")
@auth("admin")
def checkin():
    c = body().get("code", "")
    if not isinstance(c, str) or not re.fullmatch("[A-Z2-9]{8}", c.strip().upper()):
        raise APIError("Enter the 8-character check-in code.")
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        b = conn.execute(
            "SELECT b.*,s.starts_at,u.name,s.title FROM bookings b JOIN sessions s ON s.id=b.session_id JOIN users u ON u.id=b.user_id WHERE b.code=?",
            (c.strip().upper(),),
        ).fetchone()
        if not b or b["status"] != "confirmed":
            raise APIError("No active booking matches that code.", 404)
        if b["checked_in_at"]:
            raise APIError("This member has already checked in.", 409)
        start = datetime.fromisoformat(b["starts_at"])
        if not start <= now() < start + timedelta(hours=1):
            raise APIError("Check-in is only available during the session hour.", 409)
        conn.execute(
            "UPDATE bookings SET checked_in_at=? WHERE id=?", (stamp(), b["id"])
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return jsonify(name=b["name"], title=b["title"], message="Checked in successfully.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path=""):
    if path.startswith("api/"):
        raise APIError("Route not found.", 404)
    return send_from_directory(app.static_folder, "index.html")


def init_db(seed=True):
    conn = sqlite3.connect(DB)
    conn.executescript("""
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('member','admin')));
    CREATE TABLE IF NOT EXISTS tokens(digest TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY,starts_at TEXT UNIQUE NOT NULL,title TEXT NOT NULL,coach TEXT NOT NULL,kind TEXT NOT NULL,capacity INTEGER NOT NULL DEFAULT 20 CHECK(capacity=20));
    CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),session_id INTEGER NOT NULL REFERENCES sessions(id),status TEXT NOT NULL CHECK(status IN ('confirmed','waitlisted','cancelled')),code TEXT UNIQUE,created_at TEXT NOT NULL,checked_in_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS active_booking ON bookings(user_id,session_id) WHERE status!='cancelled';
    CREATE INDEX IF NOT EXISTS session_status ON bookings(session_id,status,id);
    CREATE TRIGGER IF NOT EXISTS capacity_insert BEFORE INSERT ON bookings WHEN NEW.status='confirmed' AND (SELECT count(*) FROM bookings WHERE session_id=NEW.session_id AND status='confirmed')>=20 BEGIN SELECT RAISE(ABORT,'Capacity exceeded'); END;
    CREATE TRIGGER IF NOT EXISTS capacity_update BEFORE UPDATE OF status ON bookings WHEN NEW.status='confirmed' AND OLD.status!='confirmed' AND (SELECT count(*) FROM bookings WHERE session_id=NEW.session_id AND status='confirmed')>=20 BEGIN SELECT RAISE(ABORT,'Capacity exceeded'); END;
    """)
    if seed and conn.execute("SELECT count(*) FROM users").fetchone()[0] == 0:
        password = generate_password_hash("DemoPass123!")
        people = [
            ("Alex Morgan", "alex@form.studio", "member"),
            ("Jamie Chen", "jamie@form.studio", "member"),
            ("Studio Admin", "admin@form.studio", "admin"),
        ] + [(f"Member {i}", f"member{i}@form.studio", "member") for i in range(1, 21)]
        for name, email, role in people:
            conn.execute(
                "INSERT INTO users(name,email,password,role) VALUES (?,?,?,?)",
                (name, email, password, role),
            )
        styles = [
            ("Morning flow", "Maya Patel", "Yoga", 7),
            ("Full body strength", "James Wilson", "Strength", 9),
            ("Pilates foundations", "Sofia Chen", "Pilates", 12),
            ("The midday reset", "Maya Patel", "Yoga", 14),
            ("HIIT & move", "James Wilson", "HIIT", 17),
            ("Evening unwind", "Sofia Chen", "Recovery", 19),
        ]
        for day in range(7):
            for idx, (title, coach, kind, hour) in enumerate(styles):
                start = (
                    (now() + timedelta(days=day))
                    .replace(hour=hour, minute=0, second=0, microsecond=0)
                    .isoformat()
                )
                sid = conn.execute(
                    "INSERT INTO sessions(starts_at,title,coach,kind) VALUES (?,?,?,?)",
                    (start, title, coach, kind),
                ).lastrowid
                counts = [8, 16, 20, 6, 18, 11]
                for j in range(counts[idx]):
                    conn.execute(
                        "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES (?,?,'confirmed',?,?)",
                        (4 + j, sid, code(), stamp()),
                    )
        # One usable current-hour session makes the check-in feature demonstrable.
        start = now().replace(minute=0, second=0, microsecond=0).isoformat()
        row = conn.execute(
            "SELECT id FROM sessions WHERE starts_at=?", (start,)
        ).fetchone()
        sid = (
            row[0]
            if row
            else conn.execute(
                "INSERT INTO sessions(starts_at,title,coach,kind) VALUES (?,'Open studio','Studio team','Strength')",
                (start,),
            ).lastrowid
        )
        if (
            conn.execute(
                "SELECT count(*) FROM bookings WHERE session_id=?", (sid,)
            ).fetchone()[0]
            < 20
        ):
            conn.execute(
                "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES (1,?,'confirmed',?,?)",
                (sid, code(), stamp()),
            )
        future = conn.execute(
            "SELECT id FROM sessions WHERE starts_at>? AND kind='Yoga' ORDER BY starts_at LIMIT 1",
            (stamp(),),
        ).fetchone()
        if future:
            conn.execute(
                "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES (1,?,'confirmed',?,?)",
                (future[0], code(), stamp()),
            )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 3000)),
        debug=False,
        threaded=True,
    )
