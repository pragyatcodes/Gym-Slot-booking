# Run locally, upload to GitHub, and deploy to Render

This ZIP contains the complete source. **Extract it first.** The application root is the `form-studio` folder containing `app.py`, `wsgi.py`, and `render.yaml`.

## 1. Run locally

Install Python 3.11 or newer (Python 3.13 recommended), then open a terminal inside `form-studio`.

### macOS / Linux

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Open **http://localhost:3000**. `python app.py` is the local development server and works on Windows; Gunicorn is for Linux/Render. The database is created and seeded on first startup. It is intentionally not included in the ZIP, so you start with fresh demo data rather than old test activity.

Demo password for all accounts: `DemoPass123!`

- Member: `alex@form.studio`
- Second member: `jamie@form.studio`
- Admin: `admin@form.studio`

The preview-friendly `X-Form-Token` fix is included. Normal bearer authentication remains supported.

## 2. Create a GitHub repository

Create a new **empty** repository in your GitHub account. Do not initialize it with a README, license or .gitignore: those files already exist here. Then use either method below.

### Option A — Preserve the existing commit history (recommended)

The ZIP includes `history.bundle`, a portable copy of the local Git history. From inside the extracted folder, run:

```sh
git clone history.bundle ../form-studio-repo
cd ../form-studio-repo
git branch -M main
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPOSITORY` with your actual values. GitHub may ask you to authenticate using your credential manager or a personal access token. Do not put access tokens in files or commit them.

### Option B — Start a new repository

Run these commands inside the extracted `form-studio` folder:

```sh
git init
git add .
git commit -m "Add FORM Studio booking application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

This option starts new history; it does not preserve the incremental development commits. The `.gitignore` excludes the history bundle, local database, Python environment and `.env`.

Alternatively, use GitHub's **Add file → Upload files** and upload the extracted source files, not the ZIP. Keep `render.yaml` at the repository root. Do not upload `history.bundle`, any database files, `.venv`, or private `.env` files. Command-line Git is preferable because it reliably includes dotfiles.

## 3. Deploy to Render — recommended Blueprint

1. Sign in to Render and authorize access to your GitHub repository.
2. Choose **New → Blueprint** and select your repository.
3. Render reads the included `render.yaml`.
4. **Review the cost before approving.** This configuration requests a paid `starter` web service and a 1 GB persistent disk.
5. Approve deployment. Open the HTTPS URL Render assigns when deployment is healthy.

The application, API and images are served by the same web service; you do not need a separate frontend service.

### Equivalent manual Web Service setup

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Root Directory | Leave blank if source is at the repository root |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 60 wsgi:app` |
| Health Check Path | `/` |
| Environment variable | `PYTHON_VERSION=3.13.5` |
| Environment variable | `DATABASE_PATH=/var/data/gym.sqlite3` |
| Persistent disk mount | `/var/data` |
| Persistent disk size | 1 GB |

Render supplies `PORT`; do not hardcode 3000 in the Render start command. If you upload the whole folder instead of its contents, set Root Directory to `form-studio` and place the Blueprint at the appropriate repository root or use manual setup.

`wsgi.py` creates the database directory and initializes/seeds the database before serving requests. One Gunicorn worker with multiple threads is intentional for this single-instance SQLite deployment. Keep one service instance and do not configure horizontal scaling with separate SQLite files.

## Free Render demo alternative

If you choose a free Web Service manually, omit the disk and set `DATABASE_PATH=/tmp/gym.sqlite3`. This is only a disposable demonstration: **accounts and bookings can disappear on redeploy, restart or instance replacement**. Do not treat its data as durable. The included Blueprint deliberately uses persistent storage instead. For durable data on a different architecture, migrate the data layer to a hosted relational database; this ZIP is configured for SQLite, not PostgreSQL.

## Important before sharing publicly

- This is a challenge/demo application with public admin credentials and automatic demo login, not a locked-down production deployment.
- For a real gym, remove automatic demo login and demo account shortcuts, stop seeding public accounts, rotate/remove demo credentials, and provision a private admin directly in the database.
- Add authentication/code-lookup rate limits, backups and monitoring; review the production limitations in README.md.
- The original challenge prohibits AI assistance. This implementation was AI-assisted; do not misrepresent its origin.
- No GitHub repository or Render deployment has been created on your behalf. The package is ready for you to upload and deploy.

## Tests and troubleshooting

```sh
python -m unittest discover -s tests -v
```

- `ModuleNotFoundError: flask` or `gunicorn`: install `requirements.txt` in the environment used by the server.
- Render `gunicorn: command not found`: confirm the build command installs the included requirements.
- Render missing table errors: use `wsgi:app`, not `app:app`; the WSGI entry point initializes the schema.
- Database permission errors: the persistent disk must be mounted at `/var/data`, and `DATABASE_PATH` must point inside it.
- Missing styles or API failures: open the running server URL, not the HTML file directly.
- Demo sign-in returns to login: ensure both `app.py` and `static/app.js` are from this package; authentication now also uses `X-Form-Token` for reverse-proxy compatibility.
