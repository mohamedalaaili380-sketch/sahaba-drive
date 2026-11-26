# Publishing the project to GitHub

This folder is a clean, ready-to-push copy: **no `node_modules`, no `dist`, and no local data** (`data/`).
The repo already exists with one commit; you only need to add a remote and push.

## From the command line

```bash
cd sahaba-drive

# 1) Create an empty repo on github.com (without README / .gitignore)
#    and copy the URL it gives you.

# 2) Add the remote (replace <USER> and <REPO>)
git remote add origin https://github.com/<USER>/<REPO>.git

# 3) Push
git branch -M main
git push -u origin main
```

If your repo has a different name or already has commits, use:

```bash
git remote add origin https://github.com/<USER>/<REPO>.git
git fetch origin
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## From the GitHub browser UI (no terminal)

1. Open [github.com/new](https://github.com/new) and create a new repo.
2. Drag `sahaba-drive.zip` or the folder contents onto the repo page and upload them.
3. Make sure `.gitignore` is in the root so `node_modules/` and `data/` are not uploaded.

## After publishing

```bash
npm install
npm run dev     # UI: http://localhost:5173
```

The project README has all the details (running, features, sync client, environment variables).

> Note: local test accounts and files are **not** uploaded — they only exist in `sahaba-drive/data/` on your machine.
