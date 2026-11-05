# 🚀 Ludo Arena — Production Deployment Guide for Render

This guide provides end-to-end instructions for deploying the **Ludo Arena** full-stack Telegram gaming platform to **Render** (PostgreSQL, Node.js Web Service, and React Static Site) and configuring the Telegram Mini App via **@BotFather**.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │            Telegram Group            │
                      │       @AnayaReplyBot (/start)        │
                      └──────────────────┬───────────────────┘
                                         │
                         [ 🎮 OPEN GAME ] Button
                 (https://t.me/AnayaReplyBot/ludo?startapp=...)
                                         │
                                         ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│     Render Static Site (SPA)    │  REST API     │    Render Web Service (API)     │
│       React + Vite Frontend     ├──────────────►│    Express + Telegram Bot       │
│  https://ludo-client.onrender   │◄──────────────┤    https://ludo-server.onrender │
└─────────────────────────────────┘  WebSocket    └───┬─────────────────────────────┘
                                  (Socket.IO)         │
                                                      ▼
                                          ┌───────────────────────┐
                                          │   Render PostgreSQL   │
                                          │      ludo_arena       │
                                          └───────────────────────┘
```

---

## 1. How to Push the Project to GitHub

1. Open a terminal in the root directory of the project:
   ```bash
   cd "d:\ludo bot anaya"
   ```
2. Initialize a Git repository (if not already done):
   ```bash
   git init
   git branch -M main
   ```
3. Verify `.gitignore` is present so `.env` files and `node_modules` are ignored:
   ```bash
   git status
   ```
4. Stage and commit all files:
   ```bash
   git add .
   git commit -m "feat: prepare Ludo Arena for Render production deployment"
   ```
5. Create a **Private or Public Repository** on [GitHub](https://github.com/new).
6. Link your local repository and push:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/ludo-arena.git
   git push -u origin main
   ```

---

## 2. Deploying with Render Blueprint (Recommended)

The project includes a ready-to-use [`render.yaml`](./render.yaml) Blueprint that automates creating the Database, Backend, and Frontend in one click:

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub repository.
4. Render will parse `render.yaml` and display 3 resources:
   - **Database:** `ludo-arena-db` (PostgreSQL)
   - **Web Service:** `ludo-arena-server` (Backend Node.js API)
   - **Static Site:** `ludo-arena-client` (Frontend React)
5. Fill in the required environment variables prompted by Render (detailed below).
6. Click **Apply**.

---

## 3. Manual Deployment (Alternative to Blueprint)

If you prefer deploying services individually:

### A. Create the PostgreSQL Database
1. In Render Dashboard, click **New +** > **PostgreSQL**.
2. Set Name: `ludo-arena-db`.
3. Set Database: `ludo_arena`.
4. Set User: `ludo_admin`.
5. Select Region (e.g. `Oregon (US West)`).
6. Select **Free** (or Starter) plan.
7. Click **Create Database**.
8. Once provisioned, copy the **Internal Database URL** (for backend in the same region) or **External Database URL**.

---

### B. Deploy the Backend Web Service
1. Click **New +** > **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name:** `ludo-arena-server`
   - **Region:** Same region as your database (e.g. `Oregon`)
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Add Environment Variables (see Section 4).
5. Click **Deploy Web Service**.
6. Copy your deployed server URL (e.g., `https://ludo-arena-server.onrender.com`).

---

### C. Deploy the Frontend Static Site
1. Click **New +** > **Static Site**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name:** `ludo-arena-client`
   - **Branch:** `main`
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Add Environment Variables:
   - `VITE_SERVER_URL`: Paste your backend URL (e.g. `https://ludo-arena-server.onrender.com`).
5. Add Rewrite Rule:
   - Go to **Redirects/Rewrites**.
   - Add rule: `/*` -> `/index.html` (Type: `Rewrite`).
6. Click **Create Static Site**.
7. Copy your deployed client URL (e.g., `https://ludo-arena-client.onrender.com`).

---

## 4. Environment Variables Reference

### Backend Web Service Environment Variables

| Variable | Required | Example / Description |
| :--- | :---: | :--- |
| `NODE_ENV` | **Yes** | `production` — Activates production security, strict Telegram HMAC validation, and SSL. |
| `PORT` | **Yes** | `10000` (Render defaults to 10000; server listens on `0.0.0.0`). |
| `DATABASE_URL` | **Yes** | Your Render PostgreSQL connection string. |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Token from @BotFather (e.g. `8615618884:AAFa...`). |
| `TELEGRAM_BOT_USERNAME` | **Yes** | `AnayaReplyBot` (your bot's username without `@`). |
| `TELEGRAM_MINI_APP_SHORT_NAME` | **Yes** | `ludo` (the short name configured in BotFather `/newapp`). |
| `ADMIN_TELEGRAM_IDS` | **Yes** | `8670715518,8232988642` (numeric Telegram user IDs granted bot admin rights). |
| `CLIENT_URL` | **Yes** | Your deployed frontend URL (e.g. `https://ludo-arena-client.onrender.com`). Used for CORS. |
| `WEB_APP_URL` | **Yes** | Your deployed frontend URL (e.g. `https://ludo-arena-client.onrender.com`). Used for Mini App buttons. |

### Frontend Static Site Environment Variables

| Variable | Required | Example / Description |
| :--- | :---: | :--- |
| `VITE_SERVER_URL` | **Yes** | `https://ludo-arena-server.onrender.com` (Must include `https://` without trailing slash). Used by Vite for REST requests and Socket.IO. |

---

## 5. Mutual URL Cross-Configuration

Once both services are initially created on Render:

1. Copy the **Frontend URL**:
   Go to your `ludo-arena-client` Static Site on Render (e.g. `https://ludo-arena-client.onrender.com`).
2. Update **Backend Environment Variables**:
   In `ludo-arena-server` > **Environment**:
   - Set `CLIENT_URL` = `https://ludo-arena-client.onrender.com`
   - Set `WEB_APP_URL` = `https://ludo-arena-client.onrender.com`
   Save changes (Render will automatically redeploy the backend).
3. Update **Frontend Environment Variable**:
   In `ludo-arena-client` > **Environment**:
   - Set `VITE_SERVER_URL` = `https://ludo-arena-server.onrender.com`
   Click **Manual Deploy** > **Clear build cache & deploy** so Vite bakes the backend URL into production assets.

---

## 6. How Database Migrations Run

The project automatically handles migrations on startup.
When `initializeDatabase()` runs on server boot, it executes:
- `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
- `migrations` registry table
- `001_core_tables` (users, player_profiles, matches, match_players, game_states, game_moves, comments, reactions, reports, achievements)
- `002_group_gaming` (telegram_groups, group_announcements, group matching columns)

To manually run migrations using the Render Shell:
1. Go to your `ludo-arena-server` service in Render.
2. Click **Shell** in the left menu.
3. Run:
   ```bash
   npm run migrate
   ```

---

## 7. Configuring Telegram BotFather `/newapp`

To enable the direct Mini App launch inside Telegram:

1. Open Telegram and message **[@BotFather](https://t.me/BotFather)**.
2. Send command: `/myapps` or `/newapp`.
3. Select your bot: `@AnayaReplyBot`.
4. Enter Title: `Ludo Arena`.
5. Enter Description: `Multiplayer 2-4 Player Real-Time Ludo on Telegram`.
6. Upload a 640x360 photo or icon for the Mini App.
7. Enter Web App URL:
   Paste your deployed frontend HTTPS URL:
   ```text
   https://ludo-arena-client.onrender.com
   ```
8. Enter Short Name:
   ```text
   ludo
   ```
   *(Must match `TELEGRAM_MINI_APP_SHORT_NAME=ludo` in your backend environment variables!)*
9. BotFather will confirm:
   `https://t.me/AnayaReplyBot/ludo`

---

## 8. Verifying the Telegram Group Experience

1. Add `@AnayaReplyBot` to any Telegram group or supergroup.
2. Send:
   ```text
   /start
   ```
   The bot responds with the group welcome message and inline navigation buttons.
3. Host creates a match lobby:
   ```text
   /newgame 2
   ```
   The interactive lobby appears with Player slots and inline buttons (`[➕ Join Match]`, `[👁 Watch Match]`, `[❌ Cancel Match]`).
4. A second player taps **`➕ Join Match`**:
   The message updates **in-place** with Player 2's slot filled and displays **`🚀 Start Match`**.
5. Host taps **`🚀 Start Match`**:
   The lobby message transforms into:
   ```text
   🎲 LUDO MATCH IS READY!

   The match has started!

   👥 Players:
   🔴 @HostPlayer
   🔵 @Player2

   Tap below to enter the game and play!
   ```
   With the button:
   ```text
   [ 🎮 OPEN GAME ]
   ```
6. **Player 1 & Player 2** tap **`🎮 OPEN GAME`**:
   The Mini App launches inside Telegram, automatically recognizes each user's seat, and opens the live board ready for the dice roll.
7. **Any non-player** taps **`🎮 OPEN GAME`**:
   The Mini App opens in **Spectator Mode** (`👁 Spectator Mode: Live Board View`), showing the live board, dice rolls, token animations, and live chat in real time without allowing token moves.

---

## 9. Common Render Deployment Errors & Fixes

### 1. `listen EADDRINUSE: address already in use` or connection timeout
- **Cause:** Process listening on `localhost` or fixed port.
- **Fix:** Server is configured to bind to `0.0.0.0` and read `process.env.PORT` automatically (Render sets `PORT=10000`).

### 2. `self-signed certificate in certificate chain`
- **Cause:** PostgreSQL SSL verification failing on Render external connection.
- **Fix:** In `server/src/database/db.js`, `ssl: { rejectUnauthorized: false }` is enabled for production Render connections.

### 3. Telegram `400 Bad Request: inline keyboard button URL is invalid`
- **Cause:** Using `localhost` or non-HTTPS URLs in Telegram keyboard buttons.
- **Fix:** The bot strictly uses `https://t.me/AnayaReplyBot/ludo?startapp=match_<id>` and checks all URLs with `isValidHttpsUrl()`.

### 4. WebSocket connection failing on Frontend
- **Cause:** `VITE_SERVER_URL` missing or pointing to `http://localhost:3001`.
- **Fix:** Ensure `VITE_SERVER_URL=https://your-backend.onrender.com` is configured in your Render Static Site environment variables, then trigger a manual rebuild with cleared cache.

### 5. Render Free Tier Spin-Down (Cold Starts)
- **Behavior:** Render free web services spin down after 15 minutes of inactivity. The first request takes 30-50 seconds to boot.
- **Handling:** Frontend displays a friendly **Connection Error** screen with a **`🔄 Retry Connection`** button instead of crashing.

