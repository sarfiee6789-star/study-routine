require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/study_planner';
const API_KEY = process.env.APP_API_KEY || 'StudyPlannerSecret2026';

// Connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

// User Schema (Compatible with frontend data structure)
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, index: true },
  totalMinutesWeek: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  avatarColor: { type: String, default: '#00C6FF' },
  lastActiveWeek: { type: Number, default: 0, index: true },
  isBot: { type: Boolean, default: false },
  studyReminders: { type: Boolean, default: true },
  motivationalMessages: { type: Boolean, default: true },
  dailySummary: { type: Boolean, default: true },
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);

// Helper function to get current week number
function getCurrentWeekId() {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

// Generate Dynamic Bots for Leaderboard
function generateWeeklyBots(weekId) {
  const ALL_NAMES = [
    'Alex', 'Sarah', 'CodeNinja', 'StudyBot', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William',
    'Sophia', 'James', 'Isabella', 'Benjamin', 'Mia', 'Elijah', 'Charlotte', 'Lucas', 'Amelia', 'Mason',
    'Harper', 'Ethan', 'Evelyn', 'Oliver', 'Abigail', 'Logan', 'Aria', 'Leo', 'Luna', 'Mateo',
    'Zoe', 'Julian', 'Chloe', 'Levi', 'Mila', 'Jack', 'Layla', 'Owen', 'Lily', 'Wyatt', 'Eleanor'
  ];
  const COLORS = ['#00C6FF', '#FF0844', '#9D50BB', '#F9D423', '#00B4DB', '#38EF7D', '#FC466B', '#11998E'];

  const bots = [];
  for (let i = 0; i < 25; i++) {
    const seed = (weekId * 137 + i * 19);
    const nameIndex = seed % ALL_NAMES.length;
    const minutes = ((seed * 83) % 40) * 30 + 120;
    const streak = (seed * 13) % 15;

    bots.push({
      _id: `bot_${weekId}_${i}`,
      id: `bot_${weekId}_${i}`,
      username: ALL_NAMES[nameIndex],
      totalMinutesWeek: minutes,
      streak: streak,
      avatarColor: COLORS[i % COLORS.length],
      lastActiveWeek: weekId,
      isBot: true
    });
  }
  return bots;
}

// Public Health Check Endpoint (For Render.com & uptime monitors)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Study Planner API is running smoothly 🚀',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API Key Security Middleware (Protected Routes)
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }
  next();
});

// 1. Create or Login User
app.post('/api/users', async (req, res) => {
  try {
    const { username, avatarColor, studyReminders, motivationalMessages, dailySummary } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    let user = await User.findOne({ username });

    if (!user) {
      user = new User({
        id: uuidv4(),
        username,
        totalMinutesWeek: 0,
        streak: 0,
        avatarColor: avatarColor || '#00C6FF',
        lastActiveWeek: getCurrentWeekId(),
        isBot: false,
        studyReminders: studyReminders !== undefined ? studyReminders : true,
        motivationalMessages: motivationalMessages !== undefined ? motivationalMessages : true,
        dailySummary: dailySummary !== undefined ? dailySummary : true,
      });
      await user.save();
    } else {
      let updated = false;
      if (studyReminders !== undefined && user.studyReminders !== studyReminders) {
        user.studyReminders = studyReminders;
        updated = true;
      }
      if (motivationalMessages !== undefined && user.motivationalMessages !== motivationalMessages) {
        user.motivationalMessages = motivationalMessages;
        updated = true;
      }
      if (dailySummary !== undefined && user.dailySummary !== dailySummary) {
        user.dailySummary = dailySummary;
        updated = true;
      }
      if (avatarColor && user.avatarColor !== avatarColor) {
        user.avatarColor = avatarColor;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    }

    const userObj = user.toObject();
    res.json({ ...userObj, _id: user.id });
  } catch (error) {
    console.error('Error in /api/users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Log Session
app.post('/api/sessions', async (req, res) => {
  try {
    const { userId, minutes, username } = req.body;
    if (!userId || minutes === undefined) {
      return res.status(400).json({ error: 'Missing userId or minutes' });
    }

    const currentWeek = getCurrentWeekId();
    let user = await User.findOne({ id: userId });

    if (!user) {
      user = new User({
        id: userId,
        username: username || 'Unknown',
        totalMinutesWeek: 0,
        streak: 0,
        avatarColor: '#00C6FF',
        lastActiveWeek: currentWeek,
        isBot: false
      });
    }

    // Reset weekly minutes if a new week has started
    if (user.lastActiveWeek !== currentWeek) {
      user.totalMinutesWeek = 0;
      user.lastActiveWeek = currentWeek;
    }

    if (req.body.totalWeeklyMinutes !== undefined) {
      user.totalMinutesWeek = req.body.totalWeeklyMinutes;
    } else {
      user.totalMinutesWeek += minutes;
    }

    if (req.body.streak !== undefined) {
      user.streak = req.body.streak;
    } else if (minutes >= 25 && Math.random() > 0.5) {
      user.streak += 1;
    }

    await user.save();
    const userObj = user.toObject();
    res.json({ ...userObj, _id: user.id });
  } catch (error) {
    console.error('Error in /api/sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Get Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const currentWeek = getCurrentWeekId();

    // Query active real users from MongoDB
    const realUsersDocs = await User.find({ lastActiveWeek: currentWeek });
    const realUsers = realUsersDocs.map((u) => {
      const obj = u.toObject();
      return { ...obj, _id: obj.id };
    });

    // Dynamic bots for this week
    const bots = generateWeeklyBots(currentWeek);

    const allUsers = [...realUsers, ...bots].sort(
      (a, b) => b.totalMinutesWeek - a.totalMinutesWeek || b.streak - a.streak
    );

    const topUsers = allUsers.slice(0, 50);
    topUsers.forEach((u, i) => {
      u.trueRank = i + 1;
    });

    const userId = req.query.userId;
    if (userId) {
      const userIndex = allUsers.findIndex((u) => u._id === userId || u.id === userId);
      if (userIndex >= 50) {
        const userObj = allUsers[userIndex];
        userObj.trueRank = userIndex + 1;
        topUsers.push(userObj);
      }
    }

    res.json(topUsers);
  } catch (error) {
    console.error('Error in /api/leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Delete User
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID required' });

    await User.deleteOne({ id });
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/users/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Update Preferences
app.put('/api/users/:id/preferences', async (req, res) => {
  try {
    const { id } = req.params;
    const { studyReminders, motivationalMessages, dailySummary } = req.body;

    if (!id) return res.status(400).json({ error: 'User ID required' });

    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (studyReminders !== undefined) user.studyReminders = studyReminders;
    if (motivationalMessages !== undefined) user.motivationalMessages = motivationalMessages;
    if (dailySummary !== undefined) user.dailySummary = dailySummary;

    await user.save();
    res.json({ success: true, user: { ...user.toObject(), _id: user.id } });
  } catch (error) {
    console.error('Error in PUT /api/users/:id/preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Study Planner Backend running on port ${PORT}`);
});
