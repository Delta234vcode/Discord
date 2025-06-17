const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS і cookie
app.use(cors({
  origin: ['https://discord-0c0o.onrender.com'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Безпека для Discord embed
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  next();
});

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Підключення Discord OAuth роутера
const discordAuthRouter = require('./discord-auth');
app.use('/', discordAuthRouter);

// MongoDB API (приклад)
const { getUsersCollection } = require('./mongo');
app.post('/user', async (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId) return res.status(401).json({ error: 'Not logged in' });
  const usersCollection = await getUsersCollection();
  const user = await usersCollection.findOne({ discordId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.post('/update', async (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId) return res.status(401).json({ error: 'Not logged in' });
  const usersCollection = await getUsersCollection();
  const fields = req.body;
  const update = {};
  if (fields.coins !== undefined) update.balance = fields.coins;
  if (fields.incomePerHour !== undefined) update.incomePerHour = fields.incomePerHour;
  if (fields.ownedCapsules && Array.isArray(fields.ownedCapsules)) update.ownedCapsules = fields.ownedCapsules;
  await usersCollection.updateOne({ discordId }, { $set: update });
  const user = await usersCollection.findOne({ discordId });
  res.json({ success: true, user });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
}); 
