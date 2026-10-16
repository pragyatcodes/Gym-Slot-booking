import os
import sys
import tempfile
import unittest
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as gym
from werkzeug.security import generate_password_hash


class BookingAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_db = gym.DB
        gym.DB = os.path.join(self.temp.name, "test.sqlite3")
        gym.init_db(seed=False)
        self.client = gym.app.test_client()
        self.members = []
        for i in range(24):
            d = self.client.post(
                "/api/register",
                json={
                    "name": f"Test {i}",
                    "email": f"test{i}@example.com",
                    "password": "Testing123!",
                },
            ).json
            self.members.append({"Authorization": "Bearer " + d["token"]})
        conn = sqlite3.connect(gym.DB)
        conn.execute(
            "INSERT INTO users(name,email,password,role) VALUES ('Admin','admin@test.com',?,'admin')",
            (generate_password_hash("Testing123!"),),
        )
        conn.commit()
        conn.close()
        token = self.client.post(
            "/api/login", json={"email": "admin@test.com", "password": "Testing123!"}
        ).json["token"]
        self.admin = {"Authorization": "Bearer " + token}
        self.start = (gym.now() + timedelta(days=1)).replace(
            hour=15, minute=0, second=0, microsecond=0
        )
        self.sid = self.client.post(
            "/api/sessions",
            headers=self.admin,
            json={"starts_at": self.start.isoformat()},
        ).json["session"]["id"]

    def tearDown(self):
        gym.DB = self.original_db
        self.temp.cleanup()

    def book(self, member=0, wait=False, client=None):
        return (client or self.client).post(
            f"/api/sessions/{self.sid}/book",
            headers=self.members[member],
            json={"waitlist": wait},
        )

    def fill(self):
        return [self.book(i).json["booking"] for i in range(20)]

    def test_proxy_token_transport_and_revocation(self):
        token = self.members[0]["Authorization"].removeprefix("Bearer ")
        # A proxy may remove or replace Authorization. Studio auth is independent.
        headers = {"X-Form-Token": token, "Authorization": "Bearer proxy-credential"}
        self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/sessions", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/bookings", headers=headers).status_code, 200)
        self.assertEqual(self.client.get(f"/api/admin/sessions/{self.sid}/bookings", headers=headers).status_code, 403)
        self.assertEqual(self.client.get("/api/me", headers={"X-Form-Token": "invalid"}).status_code, 401)
        self.assertEqual(self.client.post("/api/logout", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/api/me", headers=self.members[0]).status_code, 401)

    def test_registration_unique_and_no_admin_escalation(self):
        r = self.client.post(
            "/api/register",
            json={
                "name": "Other",
                "email": "TEST0@example.com",
                "password": "Testing123!",
            },
        )
        self.assertEqual(r.status_code, 409)
        r = self.client.post(
            "/api/register",
            json={
                "name": "New member",
                "email": "new@example.com",
                "password": "Testing123!",
                "role": "admin",
            },
        )
        self.assertEqual(r.json["user"]["role"], "member")
        conn = sqlite3.connect(gym.DB)
        self.assertNotEqual(
            conn.execute("SELECT password FROM users LIMIT 1").fetchone()[0],
            "Testing123!",
        )
        conn.close()

    def test_auth_and_role_protection(self):
        self.assertEqual(self.client.get("/api/sessions").status_code, 401)
        self.assertEqual(
            self.client.post(
                "/api/sessions", headers=self.members[0], json={}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                f"/api/admin/sessions/{self.sid}/bookings", headers=self.members[0]
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/admin/checkin", headers=self.members[0], json={"code": "ABCDEFGH"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"/api/sessions/{self.sid}/book", headers=self.admin, json={}
            ).status_code,
            403,
        )

    def test_concurrent_last_seat(self):
        for i in range(19):
            self.book(i)

        def compete(i):
            with gym.app.test_client() as client:
                return self.book(i, client=client).status_code

        with ThreadPoolExecutor(max_workers=5) as pool:
            outcomes = list(pool.map(compete, range(19, 24)))
        self.assertEqual(outcomes.count(201), 1)
        self.assertEqual(outcomes.count(409), 4)
        sessions = self.client.get("/api/sessions", headers=self.members[0]).json[
            "sessions"
        ]
        self.assertEqual(sessions[0]["confirmed"], 20)

    def test_fifo_promotion_and_duplicate_prevention(self):
        bookings = self.fill()
        w1 = self.book(20, True).json["booking"]
        w2 = self.book(21, True).json["booking"]
        self.assertEqual(w1["position"], 1)
        self.assertEqual(w2["position"], 2)
        self.assertEqual(self.book(20, True).status_code, 409)
        self.client.delete(
            "/api/bookings/" + str(bookings[0]["id"]), headers=self.members[0]
        )
        promoted = self.client.get("/api/bookings", headers=self.members[20]).json[
            "bookings"
        ][0]
        self.assertEqual(promoted["status"], "confirmed")
        self.assertEqual(len(promoted["code"]), 8)
        second = self.client.get("/api/bookings", headers=self.members[21]).json[
            "bookings"
        ][0]
        self.assertEqual(second["position"], 1)
        self.assertEqual(self.book(0).status_code, 409)

    def test_cancel_rebook_and_ownership(self):
        b = self.book().json["booking"]
        self.assertEqual(self.book().status_code, 409)
        self.assertEqual(
            self.client.delete(
                "/api/bookings/" + str(b["id"]), headers=self.members[1]
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/bookings", headers=self.members[1]).json["bookings"],
            [],
        )
        self.assertEqual(
            self.client.delete(
                "/api/bookings/" + str(b["id"]), headers=self.members[0]
            ).status_code,
            200,
        )
        new = self.book().json["booking"]
        self.assertNotEqual(new["code"], b["code"])

    def test_leave_waitlist_and_rejoin_at_end(self):
        self.fill()
        first = self.book(20, True).json["booking"]
        self.book(21, True)
        self.client.delete(
            "/api/bookings/" + str(first["id"]), headers=self.members[20]
        )
        self.assertEqual(self.book(20, True).json["booking"]["position"], 2)

    def test_checkin_time_window_single_use_and_cancelled_code(self):
        b = self.book().json["booking"]

        def check(c):
            return self.client.post(
                "/api/admin/checkin", headers=self.admin, json={"code": c}
            )

        self.assertEqual(check(b["code"]).status_code, 409)
        with patch.object(gym, "now", return_value=self.start + timedelta(minutes=1)):
            self.assertEqual(check(b["code"]).status_code, 200)
            self.assertEqual(check(b["code"]).status_code, 409)
        other = self.book(1).json["booking"]
        with patch.object(gym, "now", return_value=self.start + timedelta(hours=1)):
            self.assertEqual(check(other["code"]).status_code, 409)
        self.client.delete("/api/bookings/" + str(other["id"]), headers=self.members[1])
        self.assertEqual(check(other["code"]).status_code, 404)

    def test_no_booking_or_cancel_after_start(self):
        b = self.book().json["booking"]
        with patch.object(gym, "now", return_value=self.start):
            self.assertEqual(self.book(1).status_code, 409)
            self.assertEqual(
                self.client.delete(
                    "/api/bookings/" + str(b["id"]), headers=self.members[0]
                ).status_code,
                409,
            )

    def test_validation_and_duplicate_session(self):
        r = self.client.post(
            "/api/sessions",
            headers=self.admin,
            json={"starts_at": self.start.replace(minute=15).isoformat()},
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("message", r.json["error"])
        self.assertEqual(
            self.client.post(
                "/api/sessions",
                headers=self.admin,
                json={"starts_at": self.start.isoformat()},
            ).status_code,
            409,
        )
        self.assertEqual(
            self.client.get(
                "/api/sessions?date=invalid", headers=self.members[0]
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                f"/api/sessions/{self.sid}/book",
                headers=self.members[0],
                json={"waitlist": "yes"},
            ).status_code,
            400,
        )
        self.assertEqual(self.client.get("/api/missing").status_code, 404)
        self.assertEqual(
            self.client.post(
                "/api/login", data="not json", content_type="application/json"
            ).status_code,
            400,
        )

    def test_logout_revokes_token(self):
        self.assertEqual(
            self.client.post("/api/logout", headers=self.members[0]).status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/me", headers=self.members[0]).status_code, 401
        )


if __name__ == "__main__":
    unittest.main()
