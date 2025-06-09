const axios = require('axios');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
let users = {};

function loadDB() {
  if (fs.existsSync(dbPath)) {
    users = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } else {
    users = {};
  }
}
function saveDB() {
  fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
}

loadDB();

// Discord OAuth2 config
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback";

function generateReferralCode(username) {
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  return `${sanitized}${Math.floor(100 + Math.random() * 900)}`;
}

// A) Login URL
router.get("/login", (req, res) => {
  const scope = "identify";
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// B) Callback handler
router.get("/auth/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code");

  try {
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    }), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const { access_token } = tokenRes.data;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { id: discordId, username, avatar } = userRes.data;

    if (!users[discordId]) {
      users[discordId] = {
        username,
        avatar,
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
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.redirect('/');
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);
    res.status(500).send("Discord auth failed.");
  }
});

// C) Get player data
router.get("/me", (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId || !users[discordId]) return res.status(401).json({ error: "Unauthorized" });

  const u = users[discordId];
  res.json({
    discordId,
    username: u.username,
    avatar: u.avatar,
    balance: u.balance,
    incomePerHour: u.incomePerHour,
    referralCode: u.referralCode,
    referralCount: u.referrals.length,
    ownedCapsules: u.ownedCapsules
  });
});

// D) Logout
router.get("/logout", (req, res) => {
  res.clearCookie('discord_id');
  res.redirect('/');
});

module.exports = router;
