const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- OAuth2 Змінні ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Перевірка змінних середовища
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ CLIENT_ID, CLIENT_SECRET або REDIRECT_URI не задані!");
  process.exit(1);
}

// --- Налаштування Express ---
app.use(cors({
  origin: ['http://localhost:3000', 'https://discord-0c0o.onrender.com', 'https://phonetap-1.onrender.com'],
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

// --- Логіка бази даних (JSON) ---
const dbPath = path.join(__dirname, 'db.json');
let users = {};

const loadDB = () => {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      users = JSON.parse(data);
      console.log("✅ Database loaded successfully.");
    } else {
      console.log("⚠️ No database file found, starting with an empty one.");
      saveDB();
    }
  } catch (err) {
    console.error("❌ Error loading database:", err);
  }
};

const saveDB = () => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
    console.log("💾 Database saved.");
  } catch (err) {
    console.error("❌ Error saving database:", err);
  }
};

loadDB();
setInterval(saveDB, 60 * 1000);

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

    if (!users[discordId]) {
      console.log(`[Auth] Creating new user: ${username} (${discordId})`);
      users[discordId] = {
        username: username,
        avatar: avatar,
        balance: 0,
        incomePerHour: 0,
        referrals: [],
        referralCode: generateReferralCode(username),
        ownedCapsules: []
      };
      saveDB();
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
  if (!discord_id || !users[discord_id]) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = users[discord_id];
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
});

app.get('/logout', (req, res) => {
  res.clearCookie('discord_id');
  res.redirect('/');
});

app.post('/user', (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId || !users[discordId]) {
    return res.status(404).json({ error: 'User not found. Please log in.' });
  }
  return res.json(users[discordId]);
});

app.post('/update', (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId || !users[discordId]) {
    return res.status(404).json({ error: 'User not found' });
  }
  const fields = req.body;
  const user = users[discordId];

  if (fields.coins !== undefined) user.balance = fields.coins;
  if (fields.incomePerHour !== undefined) user.incomePerHour = fields.incomePerHour;
  if (fields.ownedCapsules && Array.isArray(fields.ownedCapsules)) user.ownedCapsules = fields.ownedCapsules;
  // Додай інші поля, якщо треба

  saveDB();
  res.json({ success: true, user });
});

setInterval(() => {
  const now = new Date();
  console.log("⏰ Checking for hourly income accrual...");
  for (const userId in users) {
    if (users[userId].incomePerHour > 0) {
      users[userId].balance += users[userId].incomePerHour;
      console.log(`> User ${userId} received ${users[userId].incomePerHour} coins.`);
    }
  }
  console.log("✅ Hourly income check complete.");
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
}); 
