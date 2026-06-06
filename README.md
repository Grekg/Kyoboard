# Kyoboard

This is my university dissertation project. It's a real-time collaborative whiteboard built for teams. The idea was to keep things fast and practical—you get an infinite canvas, sticky notes, and a live chat to brainstorm and work together.

## Tech Stack

* Frontend: Vanilla JS and HTML5 Canvas (using hybrid rendering)
* Backend: Node.js, Express, and Socket.IO for the real-time stuff
* Database: PostgreSQL managed with Prisma ORM

## How to run it locally

If you want to spin this up on your own machine, here is what you need to do:

1. Clone the repo and run `npm install`.
2. Spin up the PostgreSQL database using Docker by running `docker-compose up -d`. (Make sure Docker is actually running before you do this, otherwise Prisma will complain).
3. Set up your environment variables. Create a `.env` file and drop in your database URL and any required API keys.
4. Run `npx prisma db push` or `npx prisma migrate dev` to sync the schema to your database.
5. Start the server with `npm run dev`.

Once the backend is up, you can just serve the frontend files using whatever local static server you prefer (like VS Code Live Server).
