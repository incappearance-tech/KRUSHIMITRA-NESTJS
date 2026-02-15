# 🚀 Free Cloud Deployment Guide

This guide will help you deploy the **KrushiMitra Backend** for free using the "Modern Free Stack":
- **Database:** Supabase (PostgreSQL)
- **Cache:** Upstash (Redis)
- **Backend Hosting:** Render

---

## 🏗️ Step 1: Get a Free Database (Supabase)

1. Go to [https://supabase.com](https://supabase.com) and sign up/login with GitHub.
2. Click **"New Project"**.
3. Fill in the details:
   - **Name:** `KrushiMitra`
   - **Database Password:** (Generate a strong password and **Save it!**)
   - **Region:** select `Mumbai (South Asia)` or `Singapore` for best latency.
4. Click **"Create new project"**.
5. Once the project is ready (takes ~2 mins), go to **Project Settings (Cog icon) -> Database**.
6. Under **Connection string**, make sure `Nodejs` is selected.
7. **Copy the URI** using "Transaction Mode" (PgBouncer) generally recommended for serverless but "Session" mode is fine for standard servers.
   - It looks like: `postgres://postgres:[YOUR-PASSWORD]@db.[ref].supabase.co:5432/postgres`
   - **Replace `[YOUR-PASSWORD]`** with the password you created in step 3.
8. **Save this URL.** You will need it as `DATABASE_URL`.

---

## ⚡ Step 2: Get Free Redis (Upstash)

1. Go to [https://upstash.com](https://upstash.com) and login.
2. Click **"Create Database"**.
3. Name: `krushimitra-cache`.
4. Region: Choose the same region as your Supabase DB if possible (e.g., `ap-south-1` (Mumbai) or `ap-southeast-1` (Singapore)).
5. Click **"Create"**.
6. Scroll down to the "REST API" section or "Connect" section.
7. Look for the **Node.js (ioredis)** tab.
8. Copy the **Host**, **Port**, and **Password**.
   - `REDIS_HOST`: e.g., `us1-flying-cat-32849.upstash.io`
   - `REDIS_PORT`: `6379`
   - `REDIS_PASSWORD`: Your long password string.

---

## 🚀 Step 3: Deploy Backend to Render

1.  **Push your code to GitHub**
    - Ensure your latest code is pushed to your GitHub repository.

2.  **Create Service on Render**
    - Go to [https://render.com](https://render.com)
    - Click **"New +"** -> **"Web Service"**.
    - Connect your GitHub repository `KRUSHIMITRA-NESTJS`.

3.  **Configure Service**
    - **Name:** `krushimitra-api`
    - **Region:** Singapore
    - **Branch:** `main` (or master)
    - **Root Directory:** `.` (leave empty)
    - **Runtime:** `Node`
    - **Build Command:** `npm install && npx prisma generate && npm run build`
    - **Start Command:** `npm run start:prod`
    - **Instance Type:** Free

4.  **Set Environment Variables**
    Scroll down to "Advanced" -> **"Environment Variables"** and add these:

    | Key | Value |
    | :--- | :--- |
    | `DATABASE_URL` | Your Supabase URL (Step 1) |
    | `JWT_SECRET` | Create a random secret (e.g., `my-super-secret-key-123`) |
    | `REDIS_HOST` | Your Upstash Host (Step 2) |
    | `REDIS_PORT` | `6379` |
    | `REDIS_PASSWORD` | Your Upstash Password (Step 2) |
    | `PORT` | `3000` |

5.  Click **"Create Web Service"**.

---

## 🛠️ Step 4: Initialize Database

Once the deployment starts, Render will build your app.
Wait for the build to finish.

**One-time Setup:**
1. In the Render Dashboard, go to your service.
2. Click on the **"Shell"** tab in the left sidebar.
3. Wait for it to connect, then run this command to create your database tables:
   ```bash
   npx prisma db push
   ```
4. You should see "The database is now in sync with your Prisma schema."

---

## 📱 Step 5: Connect Mobile App

1. Copy your Render URL (top left of dashboard), e.g., `https://krushimitra-api.onrender.com`.
2. Open your React Native project.
3. Edit `src/api/client.ts`:

```typescript
const getBaseUrl = () => {
  if (__DEV__) {
    // ... keep existing dev logic
  }
  // UPDATE THIS LINE:
  return 'https://krushimitra-api.onrender.com/api/v1';
};
```

**Done!** Your app is now live.
