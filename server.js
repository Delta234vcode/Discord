const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- OAuth2 Змінні ---
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback";
const MONGODB_URI = "mongodb+srv://sslobodianij86:<1DuWTvhqaCBLKHob>@cluster0.orzbpzg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Перевірка змінних середовища
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !MONGODB_URI) {
  console.error("❌ CLIENT_ID, CLIENT_SECRET, REDIRECT_URI або MONGODB_URI не задані!");
  process.exit(1);
}

// --- Налаштування Express ---
app.use(cors({
  origin: ['http://localhost:3000', 'https://discord-0c0o.onrender.com'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Middleware для безпеки та вбудовування в Discord
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

let db, usersCollection;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('phonetap');
  usersCollection = db.collection('users');
  console.log('✅ Connected to MongoDB Atlas');
}
connectDB();

// --- Допоміжні функції ---
function generateReferralCode(username) {
  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  const randomNumber = Math.floor(100 + Math.random() * 900);
  return `${sanitizedUsername}${randomNumber}`;
}

// --- ЕНДПОІНТИ API ---

app.get("/login", (req, res) => {
  const scope = "identify";
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  res.redirect(discordAuthUrl);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Authorization code not provided.");
  }

  try {
    const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { id: discordId, username, avatar } = userResponse.data;

    // --- MongoDB: створення користувача, якщо не існує ---
    let user = await usersCollection.findOne({ discordId });
    if (!user) {
      console.log(`[Auth] Creating new user: ${username} (${discordId})`);
      user = {
        discordId,
        username,
        avatar,
        balance: 0,
        incomePerHour: 0,
        referrals: [],
        referralCode: generateReferralCode(username),
        ownedCapsules: []
      };
      await usersCollection.insertOne(user);
    }

    res.cookie("discord_id", discordId, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.redirect('/');

  } catch (err) {
    console.error("❌ Discord OAuth error:", err.response ? err.response.data : err.message);
    res.status(500).send("Failed to authenticate with Discord.");
  }
});

app.get("/me", (req, res) => {
  const { discord_id } = req.cookies;
  if (!discord_id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  usersCollection.findOne({ discordId: discord_id })
    .then(user => {
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        discordId: discord_id,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        incomePerHour: user.incomePerHour,
        referralCount: user.referrals.length,
        ownedCapsules: user.ownedCapsules || [],
        referralCode: user.referralCode
      });
    })
    .catch(err => {
      console.error("❌ Error retrieving user:", err);
      res.status(500).json({ error: "Failed to retrieve user information" });
    });
});

app.get('/logout', (req, res) => {
  res.clearCookie('discord_id');
  res.redirect('/');
});

app.post('/user', async (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId) return res.status(401).json({ error: 'Not logged in' });
  const user = await usersCollection.findOne({ discordId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/update', async (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId) return res.status(401).json({ error: 'Not logged in' });
  const fields = req.body;
  const update = {};
  if (fields.coins !== undefined) update.balance = fields.coins;
  if (fields.incomePerHour !== undefined) update.incomePerHour = fields.incomePerHour;
  if (fields.ownedCapsules && Array.isArray(fields.ownedCapsules)) update.ownedCapsules = fields.ownedCapsules;
  // Додай інші поля, якщо треба

  await usersCollection.updateOne({ discordId }, { $set: update });
  const user = await usersCollection.findOne({ discordId });
  res.json({ success: true, user });
});

setInterval(() => {
  const now = new Date();
  console.log("⏰ Checking for hourly income accrual...");
  usersCollection.find().forEach(async (user) => {
    if (user.incomePerHour > 0) {
      await usersCollection.updateOne(
        { discordId: user.discordId },
        { $inc: { balance: user.incomePerHour } }
      );
      console.log(`> User ${user.discordId} received ${user.incomePerHour} coins.`);
    }
  });
  console.log("✅ Hourly income check complete.");
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
}); 
