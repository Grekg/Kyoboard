const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../config/db");

// Determine Callback URL
const CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL ||
  (process.env.NODE_ENV === "production"
    ? `${process.env.CLIENT_URL}/api/auth/google/callback`
    : "http://localhost:3000/api/auth/google/callback");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const displayName = profile.displayName;
        const avatarUrl =
          profile.photos && profile.photos[0] ? profile.photos[0].value : null;

        // Check if user exists by Google ID or Email
        let user = await prisma.user.findFirst({
          where: {
            OR: [{ googleId }, { email }],
          },
        });

        if (!user) {
          // Create new user
          let username = displayName.replace(/\s+/g, "").toLowerCase();

          // Ensure username uniqueness
          let uniqueUsername = username;
          let counter = 1;
          while (
            await prisma.user.findUnique({
              where: { username: uniqueUsername },
            })
          ) {
            uniqueUsername = `${username}${counter}`;
            counter++;
          }

          user = await prisma.user.create({
            data: {
              username: uniqueUsername,
              email,
              googleId,
              avatarUrl,
              passwordHash: null, // No password for OAuth users
            },
          });
        } else if (!user.googleId) {
          // Link Google account to existing email user
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId, avatarUrl: user.avatarUrl || avatarUrl },
          });
        }

        return done(null, user);
      } catch (error) {
        console.error("Google Auth Error:", error);
        return done(error, null);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
