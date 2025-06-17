const axios = require('axios');
const express = require('express');
const router = express.Router();
const { getUsersCollection } = require('./mongo');
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = process.env.REDIRECT_URI;

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

    const usersCollection = await getUsersCollection();
    let user = await usersCollection.findOne({ discordId });
    if (!user) {
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
      sameSite: "None",
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    // JS-редірект для гарантованого збереження cookie
    res.send('<script>window.location.href = "/"</script>');
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);
    res.status(500).send("Discord auth failed.");
  }
});

// C) Get player data
router.get("/me", async (req, res) => {
  const discordId = req.cookies.discord_id;
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  const usersCollection = await getUsersCollection();
  const user = await usersCollection.findOne({ discordId });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    discordId,
    username: user.username,
    avatar: user.avatar,
    balance: user.balance,
    incomePerHour: user.incomePerHour,
    referralCode: user.referralCode,
    referralCount: user.referrals.length,
    ownedCapsules: user.ownedCapsules
  });
});

// D) Logout
router.get("/logout", (req, res) => {
  res.clearCookie('discord_id', {
    sameSite: "None",
    secure: true
  });
  res.redirect('/');
});

module.exports = router;
