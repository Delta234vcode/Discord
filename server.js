// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Шлях до локальної бази (db.json) у поточній директорії
const DB_PATH = path.join(__dirname, "db.json");

// Обʼєкт, де ми будемо зберігати користувачів у памʼяті
let users = {};

// Завантажуємо дані з db.json (якщо файл існує)
function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      users = JSON.parse(raw);
    } catch (err) {
      console.error("Error parsing db.json:", err);
      users = {};
    }
  } else {
    users = {};
  }
}

// Зберігаємо поточний стан обʼєкта users у файл db.json
function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
    // Для зручності: можна в консолі побачити, що ми перезаписали файл
    console.log("🔄 DB saved to db.json");
  } catch (err) {
    console.error("Error writing db.json:", err);
  }
}

// Ініціалізуємо базу при старті
loadDB();

// Кожну хвилину (60000 мс) робимо авто-збереження у db.json
setInterval(saveDB, 60 * 1000);

// Щоразу через 24 години експортуємо весь users → backup_YYYY-MM-DD.json
setInterval(() => {
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const exportFile = `backup_${dateStr}.json`;
  try {
    fs.writeFileSync(exportFile, JSON.stringify(users, null, 2));
    console.log(`📦 Backup saved to ${exportFile}`);
  } catch (err) {
    console.error("Error writing backup file:", err);
  }
}, 24 * 60 * 60 * 1000); // 24 години

// Дозволяємо CORS і обробку JSON-тел
app.use(cors());
app.use(express.json());

// Віддаємо статичні файли з папки public/
// (ваша гра, HTML/CSS/JS, лежить саме там)
app.use(express.static("public"));


// =============================================
// 1) POST /user
//    — Запит: { discordId: string }
//    — Якщо користувача з таким ключем немає в users, створюємо запис зі значеннями за умовчанням.
//    — Повертаємо JSON із полями { balance, incomePerHour, referrals }.
// =============================================
app.post("/user", (req, res) => {
  const { discordId } = req.body;
  if (!discordId) {
    return res.status(400).json({ error: "No Discord ID" });
  }

  // Якщо цього користувача ще нема ⇒ ініціалізуємо його
  if (!users[discordId]) {
    users[discordId] = {
      balance: 0,
      incomePerHour: 0,
      referrals: []
    };
    console.log(`🆕 New user created: ${discordId}`);
  }

  // Віддаємо поточний запис
  return res.json(users[discordId]);
});


// =============================================
// 2) POST /update
//    — Запит: { discordId, coins?, incomePerHour?, referral? }
//      * coins (якщо присутній) ⇒ записуємо у users[discordId].balance
//      * incomePerHour (якщо присутній) ⇒ записуємо у users[discordId].incomePerHour
//      * referral (якщо присутній) ⇒ якщо referral не в users[discordId].referrals, додаємо його.
//    — Повертаємо { success: true, user: users[discordId] }.
// =============================================
app.post("/update", (req, res) => {
  const { discordId, coins, incomePerHour, referral } = req.body;
  if (!discordId) {
    return res.status(400).json({ error: "No Discord ID" });
  }
  if (!users[discordId]) {
    return res.status(404).json({ error: "User not found" });
  }

  // Оновлюємо баланс, якщо прийшло поле coins
  if (coins !== undefined) {
    users[discordId].balance = coins;
  }
  // Оновлюємо incomePerHour, якщо прийшло
  if (incomePerHour !== undefined) {
    users[discordId].incomePerHour = incomePerHour;
  }
  // Додаємо нового реферала, якщо він не дублює вже існуючий
  if (referral && !users[discordId].referrals.includes(referral)) {
    users[discordId].referrals.push(referral);
  }

  return res.json({ success: true, user: users[discordId] });
});


// Запускаємо сервер
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
