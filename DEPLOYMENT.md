# Kyoboard Deployment Guide - Docker on DigitalOcean Droplet

This guide covers deploying Kyoboard to a DigitalOcean Droplet using Docker Compose.

## Architecture Overview

```
                         ┌─────────────────┐
     Internet ──────────▶│     Nginx       │
        (443)            │  (SSL + Proxy)  │
                         └────────┬────────┘
                                  │
                                  ▼ (port 3000)
                         ┌─────────────────┐
                         │   Docker App    │──────▶ PostgreSQL
                         │   (Node.js)     │       (Docker Volume)
                         └─────────────────┘
```

---

## Prerequisites

- DigitalOcean account
- Domain name pointed to your Droplet IP
- Basic SSH knowledge

---

## Step 1: Create a Droplet

1. Go to **DigitalOcean → Create → Droplet**
2. Choose **Ubuntu 24.04 LTS**
3. Select plan:
   - **Basic** $6/month (1GB RAM) - OK for testing
   - **Basic** $12/month (2GB RAM) - Recommended for production
4. Choose datacenter region
5. Add SSH key
6. Create Droplet

---

## Step 2: Initial Server Setup

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

---

## Step 3: Clone and Configure

```bash
# Clone your repository
git clone https://github.com/yourusername/kyoboard.git
cd kyoboard

# Create environment file
cp .env.example .env
nano .env
```

### Edit .env with these values:

```bash
# Database
POSTGRES_USER=kyoboard
POSTGRES_PASSWORD=YOUR_STRONG_PASSWORD_HERE
POSTGRES_DB=kyoboard

# App
JWT_SECRET=YOUR_64_CHAR_SECRET_HERE
CLIENT_URL=https://yourdomain.com
PORT=3000
```

**Generate JWT_SECRET:**

```bash
openssl rand -hex 64
```

---

## Step 4: Start Docker Containers

```bash
# Build and start containers
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

---

## Step 5: Install & Configure Nginx

```bash
# Install Nginx
apt install nginx -y

# Copy config (use the nginx.conf from your repo)
cp nginx.conf /etc/nginx/sites-available/kyoboard

# Edit with your domain
nano /etc/nginx/sites-available/kyoboard
# Replace "yourdomain.com" with your actual domain

# Enable site
ln -s /etc/nginx/sites-available/kyoboard /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx
```

---

## Step 6: Setup SSL with Certbot

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Get SSL certificate
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is already configured, but verify:
certbot renew --dry-run
```

---

## Step 7: Verify Deployment

1. **Health check:**

   ```bash
   curl https://yourdomain.com/api/health
   ```

2. **Test the app:**
   - Visit https://yourdomain.com
   - Create an account
   - Create a board
   - Test real-time features (open in 2 tabs)

---

## Useful Commands

```bash
# View logs
docker compose logs -f

# Restart containers
docker compose restart

# Stop containers
docker compose down

# Stop and remove volumes (⚠️ deletes data!)
docker compose down -v

# Rebuild after code changes
git pull
docker compose up -d --build

# Enter database container
docker compose exec db psql -U kyoboard

# Enter app container
docker compose exec app sh
```

---

## Updating the App

```bash
cd /root/kyoboard
git pull
docker compose up -d --build
```

---

## Nginx + WebSocket Explanation

**Yes, you need Nginx** for:

1. **SSL/HTTPS** - Certbot manages certificates
2. **Port 80/443** - Standard web ports (Docker uses 3000)
3. **WebSocket Upgrade** - The `/socket.io` location block handles this

The key WebSocket configuration in `nginx.conf`:

```nginx
location /socket.io {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 7d;  # Keep connection alive
}
```

Without these headers, WebSocket connections will fail!

---

## Firewall Setup

```bash
# Allow SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## Troubleshooting

### WebSocket not connecting

- Check Nginx logs: `tail -f /var/log/nginx/kyoboard.error.log`
- Verify `/socket.io` location block in nginx.conf

### Database connection failed

- Check container status: `docker compose ps`
- Check db logs: `docker compose logs db`

### Container keeps restarting

- Check logs: `docker compose logs app`
- Verify .env file has all required variables

### 502 Bad Gateway

- App container not running: `docker compose up -d`
- Check app logs: `docker compose logs app`

---

## Estimated Costs

| Component     | Cost/Month     |
| ------------- | -------------- |
| Droplet (2GB) | $12            |
| Domain        | ~$1            |
| **Total**     | **~$13/month** |

Much cheaper than App Platform + Managed DB! 🎉

---

## File Checklist

Make sure these files are in your repo:

- [ ] `Dockerfile`
- [ ] `docker-compose.yml`
- [ ] `.env.example`
- [ ] `nginx.conf`
- [ ] `404.html`
- [ ] `500.html`
