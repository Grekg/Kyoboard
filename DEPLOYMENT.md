# Kyoboard Deployment Guide - DigitalOcean

This guide covers deploying Kyoboard to DigitalOcean App Platform.

## Prerequisites

1. **DigitalOcean Account** with billing enabled
2. **GitHub Repository** with your Kyoboard code pushed
3. **PostgreSQL Database** (we'll create this on DigitalOcean)

---

## Step 1: Create a PostgreSQL Database

1. Go to **DigitalOcean Dashboard → Databases → Create Database**
2. Choose **PostgreSQL** (latest version)
3. Select a plan:
   - **Basic Node** ($15/month) for testing
   - **Professional** for production
4. Choose datacenter (same region you'll deploy the app)
5. Name it `kyoboard-db`
6. Click **Create Database Cluster**
7. **Copy the Connection String** - you'll need this later

---

## Step 2: Deploy the App

### Option A: App Platform (Recommended)

1. Go to **DigitalOcean Dashboard → Apps → Create App**
2. Connect your **GitHub** repository
3. Select your Kyoboard repo and branch (usually `main`)
4. Configure the app:

#### Component Settings:

| Setting          | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| Name             | `kyoboard`                                                 |
| Source Directory | `server`                                                   |
| Build Command    | `npm install && npx prisma generate && npx prisma db push` |
| Run Command      | `npm start`                                                |
| HTTP Port        | `3000`                                                     |

#### Static Site Component (for frontend):

1. Click **Add Component → Static Site**
2. Configure:
   - Source Directory: `/` (root)
   - Output Directory: `/`
   - Index Document: `index.html`

### Option B: Droplet (Manual Server)

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone your repo
git clone https://github.com/yourusername/kyoboard.git
cd kyoboard/server

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env  # Edit with your production values

# Run Prisma migrations
npx prisma db push

# Install PM2 for process management
npm install -g pm2

# Start the server
pm2 start src/server.js --name kyoboard

# Setup auto-restart on reboot
pm2 startup
pm2 save
```

---

## Step 3: Configure Environment Variables

In DigitalOcean App Platform, add these environment variables:

| Variable       | Value                                             | Description                            |
| -------------- | ------------------------------------------------- | -------------------------------------- |
| `NODE_ENV`     | `production`                                      | Enables production mode                |
| `DATABASE_URL` | `postgresql://...`                                | Your database connection string        |
| `JWT_SECRET`   | `your-super-long-random-string-at-least-64-chars` | Secret for JWT tokens                  |
| `CLIENT_URL`   | `https://your-app-url.ondigitalocean.app`         | Your app's public URL                  |
| `PORT`         | `3000`                                            | Server port (auto-set by App Platform) |

### Generate a Secure JWT_SECRET:

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 64
```

---

## Step 4: Database Migration

After deployment, run Prisma migrations:

```bash
# In App Platform console or via SSH
cd server
npx prisma db push
```

---

## Step 5: Verify Deployment

1. **Check Health Endpoint:**

   ```
   https://your-app-url.ondigitalocean.app/api/health
   ```

   Should return: `{"status":"ok","timestamp":"..."}`

2. **Test Login Flow:**
   - Visit your app URL
   - Create a new account
   - Verify redirect to dashboard
   - Create a new board

3. **Test Real-time Features:**
   - Open the same board in two browser tabs
   - Draw in one, verify it appears in the other
   - Test chat and shared notes

---

## Troubleshooting

### CORS Errors

Add your production URL to `CLIENT_URL` environment variable.

### Database Connection Failed

- Verify DATABASE_URL is correct
- Check if database is in same region as app
- Ensure SSL is enabled in connection string

### WebSocket Not Connecting

- App Platform handles WebSocket upgrades automatically
- If using Droplet, configure nginx:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Static Files Not Loading

Check that `NODE_ENV=production` is set so the server serves static files.

---

## SSL/HTTPS

DigitalOcean App Platform provides **free SSL certificates** automatically. No configuration needed!

For Droplets, use Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Estimated Costs

| Component            | Cost/Month    |
| -------------------- | ------------- |
| App Platform (Basic) | $5            |
| PostgreSQL (Basic)   | $15           |
| **Total**            | **$20/month** |

For higher traffic, upgrade to:

- App Platform Pro: $12/month
- PostgreSQL Professional: $50/month

---

## Quick Deploy Checklist

- [ ] Push code to GitHub
- [ ] Create PostgreSQL database
- [ ] Create App Platform app
- [ ] Set environment variables
- [ ] Run database migrations
- [ ] Test health endpoint
- [ ] Test login/signup
- [ ] Test real-time collaboration
- [ ] Set up custom domain (optional)

---

Need help? Check the [DigitalOcean Documentation](https://docs.digitalocean.com/products/app-platform/).
