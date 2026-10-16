"""Production entry point: initialize the database before serving requests."""
from pathlib import Path
from app import app, DB, init_db

Path(DB).resolve().parent.mkdir(parents=True, exist_ok=True)
init_db()
