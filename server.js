const discordAuthRoutes = require('./discord-auth');
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
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback";

// --- Налаштування Express ---
app.use(cors({
  // Дозволяємо запити з вашого Render домену та localhost для тестування
  origin: ['http://localhost:3000', 'https://discord-0c0o.onrender.com', 'https://phonetap-1.onrender.com'], 
  credentials: true // Дозволяє надсилати cookies
}));
app.use(express.json());
app.use(cookieParser()); // Додаємо middleware для роботи з cookies
app.use(express.static(path.join(__dirname, 'public'))); // Папка для статичних файлів (index.html)

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

// Завантажуємо БД при старті сервера
loadDB();

// Періодичне збереження БД кожні 60 секунд
setInterval(saveDB, 60 * 1000);


// --- Допоміжні функції ---
function generateReferralCode(username) {
  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  const randomNumber = Math.floor(100 + Math.random() * 900); // 3-значне число
  return `${sanitizedUsername}${randomNumber}`;
}


// ===================================
// --- ЕНДПОІНТИ API ---
// ===================================

// A) Ендпоінт для редіректу на сторінку авторизації Discord
app.get("/login", (req, res) => {
  const scope = "identify"; // Запитуємо базову інформацію (ID, ім'я, аватар)
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  res.redirect(discordAuthUrl);
});

// B) Ендпоінт, на який Discord повертає користувача після авторизації
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Authorization code not provided.");
  }

  try {
    // 1. Обмінюємо код на токен доступу
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

    // 2. Отримуємо інформацію про користувача за допомогою токена
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { id: discordId, username, avatar } = userResponse.data;

    // 3. Створюємо користувача в нашій "базі даних", якщо його немає
    if (!users[discordId]) {
      console.log(`[Auth] Creating new user: ${username} (${discordId})`);
      users[discordId] = {
        username: username,
        avatar: avatar,
        balance: 0,
        incomePerHour: 0,
        referrals: [],
        referralCode: generateReferralCode(username),
        ownedCapsules: [] // Використовуємо масив
      };
      saveDB(); // Зберігаємо одразу після створення нового користувача
    }

    // 4. Встановлюємо cookie для подальшої ідентифікації
    res.cookie("discord_id", discordId, {
      httpOnly: true, // Захист від доступу через JS на клієнті
      secure: process.env.NODE_ENV === 'production', // Використовувати тільки з HTTPS
      sameSite: "Lax",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 днів
    });

    // 5. Повертаємо користувача на головну сторінку гри
    res.redirect('/');

  } catch (err) {
    console.error("❌ Discord OAuth error:", err.response ? err.response.data : err.message);
    res.status(500).send("Failed to authenticate with Discord.");
  }
});

// C) Ендпоінт для перевірки статусу авторизації та отримання даних гравця
app.get("/me", (req, res) => {
  const { discord_id } = req.cookies;
  if (!discord_id || !users[discord_id]) {
    // Якщо немає cookie або такого користувача в базі, повертаємо 401
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }

  const user = users[discord_id];
  // Повертаємо публічні дані користувача
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

// D) Ендпоінт для виходу з акаунту
app.get('/logout', (req, res) => {
    res.clearCookie('discord_id');
    res.redirect('/');
});


// E) Існуючі ендпоінти для гри, адаптовані для роботи з авторизованим користувачем
app.post('/user', (req, res) => {
    // Цей ендпоінт стає менш потрібним, оскільки дані отримуються через /me,
    // але залишимо для сумісності.
    const { discordId } = req.body;
    const authId = req.cookies.discord_id;

    if (!authId && !discordId) {
        return res.status(400).json({ error: 'No user identification provided.' });
    }
    
    const finalId = authId || discordId;

    if (users[finalId]) {
        console.log(`[API /user] User found: ${finalId}`);
        res.json(users[finalId]);
    } else {
        return res.status(404).json({ error: 'User not found. Please log in.' });
    }
});

app.post('/update', (req, res) => {
    const { discordIdFromCookie } = req.cookies;
    const { discordIdFromBody, ...fields } = req.body;

    // Пріоритет ID з cookie як більш безпечного джерела
    const discordId = discordIdFromCookie || discordIdFromBody;

    if (!discordId || !users[discordId]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const user = users[discordId];
    if (fields.coins !== undefined) user.balance = fields.coins;
    if (fields.incomePerHour !== undefined) user.incomePerHour = fields.incomePerHour;
    if (fields.referral) {
        if (!user.referrals.includes(fields.referral)) {
            user.referrals.push(fields.referral);
        }
    }
    if (fields.capsules !== undefined && Array.isArray(fields.capsules)) {
        user.ownedCapsules = fields.capsules;
    }

    console.log(`[API /update] User updated: ${discordId}`, fields);
    res.json({ success: true, user });
});


// Головна сторінка
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Щоденне нарахування пасивного доходу ---
setInterval(() => {
  const now = new Date();
  // Запускаємо щохвилини, але перевіряємо, чи зараз 12:00 UTC
  if (now.getUTCHours() === 12 && now.getUTCMinutes() === 0) {
    console.log("⏰ It's 12:00 UTC. Updating daily balances...");
    for (const userId in users) {
      if (users[userId].incomePerHour > 0) {
        users[userId].balance += users[userId].incomePerHour;
        console.log(`> User ${userId} received ${users[userId].incomePerHour} coins.`);
      }
    }
    saveDB(); // Зберігаємо зміни
    console.log("✅ Daily balance update complete.");
  }
}, 60 * 1000); // Перевірка кожну хвилину

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
