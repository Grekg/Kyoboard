# Kyoboard

A real-time collaborative whiteboard for enterprises.

## Features

- 🎨 **Infinite Canvas** - Draw, sketch, and collaborate on an infinite canvas
- 👥 **Real-time Collaboration** - See live cursors, drawings, and chat
- 💬 **Team Chat** - Built-in chat for team communication
- 📝 **Shared Notes** - Collaborative notes synced in real-time
- 🔐 **Secure Authentication** - JWT-based auth with password protection
- 📱 **Responsive Design** - Works on desktop and tablet

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/kyoboard.git
   cd kyoboard
   ```

2. **Setup the server**

   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Setup the database**

   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start the server**

   ```bash
   npm run dev
   ```

5. **Open the frontend**
   - Use VS Code Live Server or any static file server
   - Open `http://localhost:5500`
   - Or deploy to any static hosting

## Project Structure

```
kyoboard/
├── css/              # Stylesheets
├── js/               # Frontend JavaScript
│   ├── config.js     # Environment configuration
│   ├── login.js      # Authentication
│   ├── dashboard.js  # Dashboard logic
│   └── board.js      # Canvas and real-time features
├── server/           # Node.js backend
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── socket/
│   │   └── server.js
│   └── prisma/
│       └── schema.prisma
├── index.html        # Landing page
├── login.html        # Login/Signup
├── dashboard.html    # User dashboard
├── board.html        # Whiteboard canvas
└── DEPLOYMENT.md     # Deployment guide
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed DigitalOcean deployment instructions.

### Quick Deploy Checklist

1. Push code to GitHub
2. Create PostgreSQL database on DigitalOcean
3. Create App Platform app
4. Set environment variables
5. Run database migrations
6. Test and go live!

## Environment Variables

| Variable       | Description                   |
| -------------- | ----------------------------- |
| `DATABASE_URL` | PostgreSQL connection string  |
| `JWT_SECRET`   | Secret for JWT token signing  |
| `CLIENT_URL`   | Frontend URL for CORS         |
| `NODE_ENV`     | `development` or `production` |
| `PORT`         | Server port (default: 3000)   |

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.io
- **Auth**: JWT tokens

## License

MIT
