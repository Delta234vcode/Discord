const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Налаштування Express ---
app.use(cors({
  origin: true, // Дозволяємо запити з будь-якого джерела
  credentials: true
}));
app.use(express.json());

// --- Middleware для Discord Activity (iFrame) ---
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
      users = JSON.parse(data) || {};
      console.log("✅ Database loaded successfully.");
    } else {
      console.log("⚠️ No database file found, creating an empty one.");
      fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
    }
  } catch (err) {
    console.error("❌ Error loading database:", err);
    users = {};
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

// --- Допоміжна функція ---
function generateReferralCode(idPart) {
  return idPart.substring(0, 4) + Math.floor(100 + Math.random() * 900);
}

// ===================================
// --- ЕНДПОІНТИ API ---
// ===================================

app.post('/user', (req, res) => {
    const { discordId } = req.body;
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }

    if (users[discordId]) {
        console.log(`[API /user] User found: ${discordId}`);
        res.json(users[discordId]);
    } else {
        console.log(`[API /user] Creating new user: ${discordId}`);
        users[discordId] = {
            username: `Agent-${discordId.substring(0, 4)}`, // Генеруємо ім'я за замовчуванням
            avatar: null, // Аватара немає без логіну
            balance: 0,
            incomePerHour: 0,
            referrals: [],
            referralCode: generateReferralCode(discordId),
            ownedCapsules: []
        };
        saveDB(); // Зберігаємо одразу
        res.status(201).json(users[discordId]);
    }
});

app.post('/update', (req, res) => {
    const { discordId, ...fields } = req.body;
    if (!discordId || !users[discordId]) {
        return res.status(404).json({ error: 'User not found' });
    }

    const user = users[discordId];
    if (fields.coins !== undefined) user.balance = fields.coins;
    if (fields.incomePerHour !== undefined) user.incomePerHour = fields.incomePerHour;
    
    // Оновлення рефералів: знаходимо власника коду та додаємо нового реферала
    if (fields.referral) {
        let referrerFound = false;
        for (const id in users) {
            if (users[id].referralCode === fields.referral) {
                if (!users[id].referrals.includes(discordId)) {
                    users[id].referrals.push(discordId);
                    console.log(`[Referral] User ${discordId} was referred by ${id}`);
                }
                referrerFound = true;
                break;
            }
        }
    }
    
    if (fields.capsules !== undefined && Array.isArray(fields.capsules)) {
        user.ownedCapsules = fields.capsules;
    }

    console.log(`[API /update] User updated: ${discordId}`, fields);
    res.json({ success: true, user });
});


// --- Щоденне нарахування пасивного доходу ---
setInterval(() => {
  const now = new Date();
  if (now.getUTCHours() === 12 && now.getUTCMinutes() === 0) {
    console.log("⏰ It's 12:00 UTC. Updating daily balances...");
    for (const userId in users) {
      if (users[userId].incomePerHour > 0) {
        users[userId].balance += users[userId].incomePerHour;
        console.log(`> User ${userId} received ${users[userId].incomePerHour} coins.`);
      }
    }
    saveDB();
    console.log("✅ Daily balance update complete.");
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
