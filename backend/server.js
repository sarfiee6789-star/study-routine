const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-Memory Database
let users = [];
let nextId = 1;

function getCurrentWeekId() {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

// Generate Dynamic Bots for the Week
function generateWeeklyBots(weekId) {
  const ALL_NAMES = [
    'Alex', 'Sarah', 'CodeNinja', 'StudyBot', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William',
    'Sophia', 'James', 'Isabella', 'Benjamin', 'Mia', 'Elijah', 'Charlotte', 'Lucas', 'Amelia', 'Mason',
    'Harper', 'Ethan', 'Evelyn', 'Oliver', 'Abigail', 'Logan', 'Aria', 'Leo', 'Luna', 'Mateo',
    'Zoe', 'Julian', 'Chloe', 'Levi', 'Mila', 'Jack', 'Layla', 'Owen', 'Lily', 'Wyatt', 'Eleanor'
  ];
  const COLORS = ['#00C6FF', '#FF0844', '#9D50BB', '#F9D423', '#00B4DB', '#38EF7D', '#FC466B', '#11998E'];
  
  // Use weekId to deterministically shuffle names and generate hours
  const bots = [];
  for (let i = 0; i < 25; i++) {
    // pseudo-random seed based on week and index
    const seed = (weekId * 137 + i * 19);
    
    const nameIndex = seed % ALL_NAMES.length;
    // Vary hours based on week, max ~20 hours
    const minutes = ((seed * 83) % 40) * 30 + 120;
    const streak = (seed * 13) % 15;
    
    bots.push({
      _id: `bot_${weekId}_${i}`,
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

// 1. Create or Login User
app.post('/api/users', (req, res) => {
  const { username, avatarColor } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  let user = users.find(u => u.username === username);
  if (!user) {
    user = {
      _id: `user_${nextId++}`,
      username,
      totalMinutesWeek: 0,
      streak: 0,
      avatarColor: avatarColor || '#00C6FF',
      lastActiveWeek: getCurrentWeekId(),
      isBot: false
    };
    users.push(user);
  }
  res.json(user);
});

// 2. Log Session
app.post('/api/sessions', (req, res) => {
  console.log('Received session:', req.body);
  const { userId, minutes, username } = req.body;
  if (!userId || minutes === undefined) return res.status(400).json({ error: 'Missing data' });
  
  let user = users.find(u => u._id === userId);
  if (!user) {
    user = {
      _id: userId,
      username: username || 'Unknown',
      totalMinutesWeek: 0,
      streak: 0,
      avatarColor: '#00C6FF',
      lastActiveWeek: getCurrentWeekId(),
      isBot: false
    };
    users.push(user);
  }
  
  const currentWeek = getCurrentWeekId();
  if (user.lastActiveWeek !== currentWeek) {
    user.totalMinutesWeek = 0;
    user.lastActiveWeek = currentWeek;
  }
  
  if (req.body.totalWeeklyMinutes !== undefined) {
    // If frontend provides the calculated total weekly minutes, trust it.
    // This allows local sessions to be recovered perfectly even if the in-memory server resets.
    user.totalMinutesWeek = req.body.totalWeeklyMinutes;
  } else {
    user.totalMinutesWeek += minutes;
  }
  
  if (req.body.streak !== undefined) {
    user.streak = req.body.streak;
  } else if (minutes >= 25 && Math.random() > 0.5) {
    user.streak += 1;
  }
  
  res.json(user);
});

// 3. Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const currentWeek = getCurrentWeekId();
  
  // Real users who have been active this week
  const realUsers = users.filter(u => !u.isBot && u.lastActiveWeek === currentWeek);
  
  // Dynamic bots for this week
  const bots = generateWeeklyBots(currentWeek);
  
  const topUsers = [...realUsers, ...bots]
    .sort((a, b) => b.totalMinutesWeek - a.totalMinutesWeek || b.streak - a.streak)
    .slice(0, 50);
    
  res.json(topUsers);
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => { // Bind to 0.0.0.0 so network devices can connect
  console.log(`In-memory backend server running on port ${PORT}`);
});
