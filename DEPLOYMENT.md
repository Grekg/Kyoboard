# Kyoboard DigitalOcean Deployment Guide

This guide walks you through deploying Kyoboard to a DigitalOcean Droplet using Docker.

## 1. Concepts

- **Droplet:** A virtual private server (VPS). Think of it as a remote computer running Linux that is always on.
- **Docker:** A tool to package the app and its dependencies (Node.js, Postgres, Nginx) into "containers".
- **Docker Compose:** A tool to run multiple containers together (App + Database + Nginx) with one command.

## 2. Prerequisites

- **DigitalOcean Account.**
- **Domain Name (Recommended):** While you can access the app via an IP address (e.g., `http://192.168.1.1`), features like "Copy Link" and SSL (HTTPS) require a proper domain (e.g., `kyoboard.com`).
  - _Trade-off:_ Without a domain, you cannot have HTTPS (secure connection), and copy-paste links will look like IP addresses.

---

## 3. Step-by-Step Deployment

### Step A: Create a Droplet

1. Log in to DigitalOcean and click **Create -> Droplets**.
2. **Region:** Choose one closest to you/your users.
3. **OS:** Select **Ubuntu 22.04 (LTS)** or **24.04 (LTS)**.
4. **Size:**
   - **Recommended:** **Basic -> Regular -> 2GB / 1 CPU ($12/mo)** or **4GB / 2 CPU ($24/mo)**.
   - _Note:_ Node.js and Postgres can be memory-heavy. 1GB might struggle during build.
5. **Authentication:** Select **SSH Key** (upload your public key) or **Password** (easier for beginners, but less secure).
6. **Hostname:** Give it a name (e.g., `kyoboard-server`).
7. Click **Create Droplet**.

### Step B: Connect to Server

Open your terminal (or Command Prompt/PowerShell) and SSH into your new server IP:

```bash
ssh root@YOUR_DROPLET_IP
# If prompted, type 'yes' and enter your password.
```

### Step C: Install Docker & Git

Run these commands one by one to install the necessary tools:

```bash
# Update system
apt update && apt upgrade -y

# Install Git and Curl
apt install git curl -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose (Modern versions have it built-in, but just in case)
apt install docker-compose-plugin -y
```

### Step D: Clone Project & Configure

1. Clone your repository (Replace with your actual GitHub URL):

   ```bash
   git clone https://github.com/YOUR_USERNAME/Kyoboard.git
   cd Kyoboard
   ```

2. **Create Environment File:**
   Copy the example env file (assuming your repo structure has `server/.env.example` or similar due to your local setup, but for Docker we usually place `.env` at root next to `docker-compose.yml`):

   ```bash
   # We need a .env file at the project root for docker-compose
   nano .env
   ```

   Paste the following configuration (Adjust values!):

   ```ini
   # Database (Internal Docker URL)
   POSTGRES_USER=kyoboard
   POSTGRES_PASSWORD=secure_password_here
   POSTGRES_DB=kyoboard

   # App
   NODE_ENV=production
   JWT_SECRET=super_long_random_secret_string_here

   # IMPORTANT: Set this to your generic domain or IP for now
   CLIENT_URL=http://yourdomain.com
   ```

   _Press `Ctrl+X`, then `Y`, then `Enter` to save._

3. **Update Nginx Config:**
   Open `nginx.conf` and replace `yourdomain.com` with your actual domain or IP address.
   ```bash
   nano nginx.conf
   ```

   - Find `server_name yourdomain.com ...`
   - Change `yourdomain.com` to your actual domain.
   - _If using only IP:_ set `server_name _;` (underscore).

### Step E: Run the Application

Start the containers in the background:

```bash
docker compose up -d --build
```

- Wait a few minutes. You can check logs with `docker compose logs -f app`.
- Visit `http://YOUR_DROPLET_IP` (or your domain).
- **Success!** Your app should be running.

---

## 4. Enabling HTTPS (SSL)

_Skip this if you are only using an IP address._

1. **Ensure Domain DNS Points to Droplet:**
   - In your Domain Registrar (User/GoDaddy/Namecheap), add an **A Record**.
   - Host: `@` -> Value: `YOUR_DROPLET_IP`.

2. **Get Certificates (Certbot):**
   Run this temporary container to generate certs:

   ```bash
   # Replace email and domain with yours
   docker run -it --rm --name certbot \
     -v "$PWD/certbot/conf:/etc/letsencrypt" \
     -v "$PWD/certbot/www:/var/www/certbot" \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     --email you@example.com \
     --agree-tos \
     --no-eff-email \
     -d yourdomain.com -d www.yourdomain.com
   ```

3. **Enable HTTPS in Nginx:**
   Edit `nginx.conf` again:

   ```bash
   nano nginx.conf
   ```

   - Uncomment the `redirect HTTP to HTTPS` line in the first block.
   - Uncomment the entire second `server { ... }` block (SSL).
   - Ensure paths match `/etc/letsencrypt/live/yourdomain.com/...`.

4. **Reload Nginx:**
   ```bash
   docker compose restart nginx
   ```

## 5. Maintenance

- **Update App:**
  ```bash
  git pull
  docker compose up -d --build
  ```
- **View Logs:**
  ```bash
  docker compose logs -f
  ```
