if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error("❌ CLIENT_ID, CLIENT_SECRET або REDIRECT_URI не задані!");
  process.exit(1);
}
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth налаштування
const CLIENT_ID = "1376165214206296215";
const CLIENT_SECRET = "mJam66t0IjNnrilqf43UCJMjrB2Z1FjZ";
const REDIRECT_URI = "https://discord-0c0o.onrender.com/auth/callback";

// In-memory зберігання (в продакшені використовуйте базу даних)
const users = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Discord OAuth endpoints
app.get('/auth/discord', (req, res) => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        // Обмін коду на токен
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
        });

        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            return res.redirect('/?error=token_error');
        }

        // Отримання інформації про користувача
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        const userData = await userResponse.json();
        
        if (!userData.id) {
            return res.redirect('/?error=user_error');
        }

        // Перенаправлення на головну сторінку з Discord ID
        res.redirect(`/?discord_id=${userData.id}&username=${encodeURIComponent(userData.username)}`);
        
    } catch (error) {
        console.error('Discord OAuth error:', error);
        res.redirect('/?error=oauth_error');
    }
});

// API endpoints
app.post('/user', async (req, res) => {
    try {
        const { discordId } = req.body;
        
        if (!discordId) {
            return res.status(400).json({ error: 'Discord ID is required' });
        }

        let user = users.get(discordId);
        
        if (!user) {
            // Створення нового користувача
            user = {
                discordId: discordId,
                balance: 0,
                incomePerHour: 0,
                referrals: [],
                ownedCapsules: [],
                energy: 200,
                taps: 0,
                nextTapAvailableTime: null,
                dailyClaimData: {
                    step: 0,
                    lastClaimDate: null
                }
            };
            users.set(discordId, user);
        }

        res.json(user);
        
    } catch (error) {
        console.error('Error in /user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/update', async (req, res) => {
    try {
        const { discordId, ...fieldsToUpdate } = req.body;
        
        if (!discordId) {
            return res.status(400).json({ error: 'Discord ID is required' });
        }

        let user = users.get(discordId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Оновлення полів
        Object.assign(user, fieldsToUpdate);
        users.set(discordId, user);

        res.json({ success: true, user });
        
    } catch (error) {
        console.error('Error in /update:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Сервіс статичних файлів
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Discord OAuth URL: http://localhost:${PORT}/auth/discord`);
}); 
