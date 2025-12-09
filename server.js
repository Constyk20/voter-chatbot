require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Groq } = require('groq-sdk');
const app = express();

app.use(cors());
app.use(express.json());

// Load Groq API key
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voterDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB 😊'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const voterSchema = new mongoose.Schema({
  topic: String,
  subtopic: String,
  details: String,
  lastUpdated: Date,
});
const VoterInfo = mongoose.model('VoterInfo', voterSchema);

const feedbackSchema = new mongoose.Schema({
  userMessage: String,
  botResponse: String,
  rating: Number,
  comment: String,
  timestamp: { type: Date, default: Date.now },
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

const queryLogSchema = new mongoose.Schema({
  userMessage: String,
  topic: String,
  subtopic: String,
  timestamp: { type: Date, default: Date.now },
});
const QueryLog = mongoose.model('QueryLog', queryLogSchema);

// Sample data for Nigeria
const sampleData = [
  { topic: 'registration', subtopic: 'general', details: 'To register as a voter in Nigeria, visit INEC website at inec.gov.ng or any INEC office with your NIN and valid ID. Registration is free and open year-round.', lastUpdated: new Date() },
  { topic: 'registration', subtopic: 'Lagos', details: 'In Lagos State, register at INEC offices or designated centers. Use your BVN or NIN. Continuous registration available; check inec.gov.ng for nearest location.', lastUpdated: new Date() },
  { topic: 'polling station', subtopic: 'general', details: 'Find your polling unit via INEC website (inec.gov.ng) or app by entering your PVC number or address. Polling typically starts at 8 AM and ends at 4 PM.', lastUpdated: new Date() },
  { topic: 'polling station', subtopic: 'Lagos', details: 'Lagos voters can locate polling units on inec.gov.ng or call INEC helpline 0800-CALL-inec. Expect long queues; arrive early.', lastUpdated: new Date() },
  { topic: 'party platform', subtopic: 'APC', details: 'APC (All Progressives Congress): Focuses on economic reform, infrastructure development, security, and anti-corruption measures.', lastUpdated: new Date() },
  { topic: 'party platform', subtopic: 'PDP', details: 'PDP (People\'s Democratic Party): Emphasizes job creation, education, healthcare access, and agricultural development.', lastUpdated: new Date() },
];

VoterInfo.countDocuments().then(count => {
  if (count === 0) {
    VoterInfo.insertMany(sampleData)
      .then(() => console.log('Sample data inserted—ready to educate Nigerian voters! 📚'))
      .catch(err => console.error('Error inserting sample data:', err));
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message.trim();
  if (!userMessage) {
    return res.json({ response: "Hello! What voter question can I help with today? 😄" });
  }

  try {
    // Determine topic and subtopic
    let topic = 'general';
    let subtopic = 'general';
    const lowerMessage = userMessage.toLowerCase();
    const states = ['lagos', 'abuja', 'kano', 'rivers'];
    const detectedState = states.find(state => lowerMessage.includes(state)) || 'general';

    if (lowerMessage.includes('register') || lowerMessage.includes('registration')) {
      topic = 'registration';
      subtopic = detectedState;
    } else if (lowerMessage.includes('polling') || lowerMessage.includes('station') || lowerMessage.includes('vote')) {
      topic = 'polling station';
      subtopic = detectedState;
    } else if (lowerMessage.includes('party') || lowerMessage.includes('platform')) {
      topic = 'party platform';
      subtopic = lowerMessage.includes('apc') ? 'APC' : lowerMessage.includes('pdp') ? 'PDP' : 'general';
    }

    // Log query
    await QueryLog.create({ userMessage, topic, subtopic });

    // Fetch context
    const info = await VoterInfo.findOne({ topic, subtopic }) || await VoterInfo.findOne({ topic, subtopic: 'general' });
    const context = info ? `Relevant facts: ${info.details}` : 'I have general voter education info—stick to registration, polling, or party platforms for best help!';

    // Generate response with Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a friendly, non-partisan voter education assistant for Nigeria. Keep responses engaging, concise (under 150 words), and encouraging. Use emojis sparingly (max 1-2 per response). Always base answers on provided facts—don't add opinions or unverified info. Reference INEC as the official source. End with a question to keep the chat going if it fits. Topics: voter registration (via INEC), polling units, political party platforms (e.g., APC, PDP).`
        },
        {
          role: 'user',
          content: `${userMessage}\n\nContext from database: ${context}`
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 200,
    });

    const response = completion.choices[0]?.message?.content || "Oops, something went sideways—try rephrasing? We're here to help you vote in Nigeria! 🗳️";

    res.json({ response });
  } catch (err) {
    console.error('Error with Groq or DB:', err);
    res.status(500).json({ 
      response: "Aw, shucks—I'm having a hiccup. For voter registration, head to inec.gov.ng. What else can I clarify?" 
    });
  }
});

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
  const { userMessage, botResponse, rating, comment } = req.body;
  try {
    const feedback = new Feedback({ userMessage, botResponse, rating, comment });
    await feedback.save();
    res.json({ message: 'Thanks for your feedback! It helps us improve voter education in Nigeria. 😊' });
  } catch (err) {
    console.error('Error saving feedback:', err);
    res.status(500).json({ message: 'Oops, feedback save failed. Try again?' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'All good! Server + Groq ready for Nigerian voter chats 🚀' });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server buzzing on port ${PORT}—let's get Nigerians voting! 🌟`));
