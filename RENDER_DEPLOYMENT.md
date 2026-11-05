# 🚀 Ludo Arena — Production Deployment Guide for Render & MongoDB Atlas

This guide provides end-to-end instructions for deploying the **Ludo Arena** full-stack Telegram gaming platform to **Render** with **MongoDB Atlas**, and configuring the Telegram Mini App via **@BotFather**.

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
                                          │     MongoDB Atlas     │
                                          │  Cluster (ludo_arena) │
                                          └───────────────────────┘
```

---

## 1. Setting up MongoDB Atlas Database

1. Log in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a Free M0 cluster (e.g. AWS / us-east-1 or any preferred region).
3. Under **Security > Database Access**:
   - Create a database user (e.g. `ludo_admin`) with password.
   - Assign `Read and write to any database` permissions.
4. Under **Security > Network Access**:
   - Add IP Access: `0.0.0.0/0` (Allow Access from Anywhere so Render instances can connect).
5. Click **Connect > Drivers > Node.js**:
   - Copy your connection string:
     ```
     mongodb+srv://ludo_admin:<password>@cluster0.xxxxx.mongodb.net/ludo_arena?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your database user password.

---

## 2. How to Push the Project to GitHub

1. Open a terminal in the root directory:
   ```bash
   cd "d:\ludo bot anaya"
   ```
2. Initialize a Git repository (if not already done):
   ```bash
   git init
   git branch -M main
   ```
3. Stage and commit all files:
   ```bash
   git add .
   git commit -m "feat: migrate Ludo Arena backend to MongoDB Atlas"
   ```
4. Create a repository on [GitHub](https://github.com/new).
5. Link your local repository and push:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/ludo-arena.git
   git push -u origin main
   ```

---

## 3. Deploying with Render Blueprint (Recommended)

The project includes a ready-to-use [`render.yaml`](./render.yaml) Blueprint:

1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub repository.
4. Render will parse `render.yaml` and configure:
   - **Web Service:** `ludo-arena-server` (Backend Node.js API + Socket.IO + Bot)
   - **Static Site:** `ludo-arena-client` (Frontend React)
5. Set `MONGODB_URI` with your Atlas connection string.
6. Click **Apply**.

---

## 4. Manual Deployment on Render

### A. Deploy the Backend Web Service
1. Click **New +** > **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name:** `ludo-arena-server`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
4. Add Environment Variables (see Section 5).
5. Click **Deploy Web Service**.
6. Copy your deployed server URL (e.g., `https://ludo-arena-server.onrender.com`).

---

### B. Deploy the Frontend Static Site
1. Click **New +** > **Static Site**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Name:** `ludo-arena-client`
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

## 5. Environment Variables Reference

### Backend Web Service Environment Variables

| Variable | Required | Example / Description |
| :--- | :---: | :--- |
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | **Yes** | `10000` (Render defaults to 10000) |
| `MONGODB_URI` | **Yes** | `mongodb+srv://user:pass@cluster.mongodb.net/ludo_arena?retryWrites=true&w=majority` |
| `TELEGRAM_BOT_TOKEN` | **Yes** | Token from @BotFather (e.g. `8615618884:AAFa...`) |
| `TELEGRAM_BOT_USERNAME` | **Yes** | `AnayaReplyBot` |
| `TELEGRAM_MINI_APP_SHORT_NAME` | **Yes** | `ludo` (the short name configured in BotFather `/newapp`) |
| `ADMIN_TELEGRAM_IDS` | **Yes** | `8670715518,8232988642` |
| `CLIENT_URL` | **Yes** | `https://ludo-arena-client.onrender.com` (Used for CORS) |
| `WEB_APP_URL` | **Yes** | `https://ludo-arena-client.onrender.com` (Used for Mini App buttons) |

### Frontend Static Site Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `VITE_SERVER_URL` | **Yes** | `https://ludo-arena-server.onrender.com` (Backend URL without trailing slash) |

---

## 6. Mutual URL Cross-Configuration

Once both services are initially created on Render:

1. Copy the **Frontend URL** (`https://ludo-arena-client.onrender.com`).
2. In `ludo-arena-server` > **Environment**:
   - Set `CLIENT_URL` = `https://ludo-arena-client.onrender.com`
   - Set `WEB_APP_URL` = `https://ludo-arena-client.onrender.com`
   Save changes (triggers redeploy).
3. In `ludo-arena-client` > **Environment**:
   - Set `VITE_SERVER_URL` = `https://ludo-arena-server.onrender.com`
   Click **Manual Deploy** > **Clear build cache & deploy** so Vite bakes the URL into client bundles.

---

## 7. Telegram Mini App Configuration (@BotFather)

1. Open [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/mybots` > select your bot (`@AnayaReplyBot`).
3. Click **Bot Settings** > **Menu Button** > **Configure menu button**:
   - Send the HTTPS URL: `https://ludo-arena-client.onrender.com`
   - Menu button text: `🎲 Play Ludo`
4. Set up the Mini App short name:
   - Send `/newapp`
   - Select `@AnayaReplyBot`
   - Title: `Ludo Arena`
   - Description: `Play real-time multiplayer Ludo with friends in Telegram!`
   - Upload 640x360 photo
   - Web App URL: `https://ludo-arena-client.onrender.com`
   - Short Name: `ludo` (must match `TELEGRAM_MINI_APP_SHORT_NAME=ludo`)
5. Direct group game invites automatically launch:
   `https://t.me/AnayaReplyBot/ludo?startapp=match_<MATCH_ID>`
