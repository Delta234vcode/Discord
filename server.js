const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ 2. Змінні авторизації
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback";

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
setInterval(saveDB, 60 * 1000); // Зберігати кожну хвилину

function generateReferralCode(username) {
  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  const randomNumber = Math.floor(100 + Math.random() * 900);
  return `${sanitizedUsername}${randomNumber}`;
}

// ===================================
// --- ЕНДПОІНТИ API ---
// ===================================

// ✅ 3. Ендпоінт логіну /login
app.get("/login", (req, res) => {
  const scope = "identify"; // "identify email" також підходить
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  res.redirect(discordAuthUrl);
});

// ✅ 4. Ендпоінт /auth/callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("No code provided.");
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

    // Створення користувача, якщо він не існує
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

    // Встановлення cookie з правильними налаштуваннями безпеки
    res.cookie("discord_id", discordId, {
      httpOnly: true,
      sameSite: "Lax", // "Lax" - рекомендовано для безпеки
      secure: process.env.NODE_ENV === "production", // true тільки для HTTPS
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 днів
    });

    res.redirect('/'); // Повернення користувача в гру

  } catch (err) {
    console.error("OAuth callback error:", err.response?.data || err.message);
    res.status(500).send("Authentication failed.");
  }
});

// Інші ендпоінти залишаються без змін, оскільки вони вже використовують cookie
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
  if (fields.referral && !user.referrals.includes(fields.referral)) {
    user.referrals.push(fields.referral);
  }
  if (fields.capsules && Array.isArray(fields.capsules)) {
    user.ownedCapsules = fields.capsules;
  }

  saveDB();
  res.json({ success: true, user });
});

app.get('/logout', (req, res) => {
    res.clearCookie('discord_id');
    res.redirect('/');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
