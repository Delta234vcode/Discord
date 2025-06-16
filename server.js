const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- OAuth2 Змінні ---
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback"; // Замініть на ваш URL

// --- Налаштування Express ---
app.use(cors({
  origin: ['http://localhost:3000', 'https://discord-0c0o.onrender.com', 'https://phonetap-1.onrender.com'], // Додайте сюди домен вашого фронтенду
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

// Завантаження та періодичне збереження БД
loadDB();
setInterval(saveDB, 60 * 1000); // Зберігати кожну хвилину

// --- Допоміжні функції ---
function generateReferralCode(username) {
  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  const randomNumber = Math.floor(100 + Math.random() * 900);
  return `${sanitizedUsername}${randomNumber}`;
}

// ===================================
// --- ЕНДПОІНТИ API ---
// ===================================

// --- ЗАЛИШЕНО БЕЗ ЗМІН: OAuth2 та /me ---

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
      secure: true, // Важливо для production
      sameSite: "None",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 днів
    });

    res.redirect('/'); // Редірект на головну сторінку гри

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


// --- ✅ ОНОВЛЕНІ ЕНДПОІНТИ /user та /update ---

/**
 * @route POST /user
 * @desc Отримує дані користувача на основі cookie.
 * Клієнт повинен використовувати цей ендпоінт для завантаження даних гравця після
 * перевірки автентифікації через /me.
 */
app.post('/user', (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId || !users[discordId]) {
    // Якщо користувача немає в базі або немає cookie, повертаємо помилку
    return res.status(404).json({ error: 'User not found. Please log in.' });
  }

  // Повертаємо повний об'єкт користувача
  return res.json(users[discordId]);
});


/**
 * @route POST /update
 * @desc Оновлює дані гравця. Автентифікація виключно через cookie.
 */
app.post('/update', (req, res) => {
  // 1. Отримуємо ID тільки з cookie
  const discordId = req.cookies.discord_id;

  // 2. Перевіряємо, чи користувач автентифікований і існує
  if (!discordId || !users[discordId]) {
    return res.status(404).json({ error: 'User not found' });
  }

  // 3. Оновлюємо поля
  const fields = req.body;
  const user = users[discordId];

  if (fields.coins !== undefined) user.balance = fields.coins;
  if (fields.incomePerHour !== undefined) user.incomePerHour = fields.incomePerHour;
  if (fields.referral && !user.referrals.includes(fields.referral)) {
    user.referrals.push(fields.referral);
  }
  // Повністю перезаписуємо масив капсул, як у клієнтському коді
  if (fields.capsules && Array.isArray(fields.capsules)) {
    user.ownedCapsules = fields.capsules;
  }

  console.log(`[API /update] User updated: ${discordId}`, fields);
  // 4. Зберігаємо зміни та повертаємо оновлені дані
  saveDB();
  res.json({ success: true, user });
});


// --- Сервісна логіка (наприклад, щоденний дохід) ---
setInterval(() => {
  const now = new Date();
  // Приклад: нараховуємо дохід щогодини
  console.log("⏰ Checking for hourly income accrual...");
  for (const userId in users) {
    if (users[userId].incomePerHour > 0) {
      users[userId].balance += users[userId].incomePerHour;
      console.log(`> User ${userId} received ${users[userId].incomePerHour} coins.`);
    }
  }
  // Збереження буде виконано наступним setInterval від saveDB
  console.log("✅ Hourly income check complete.");
}, 60 * 60 * 1000); // Кожну годину

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
