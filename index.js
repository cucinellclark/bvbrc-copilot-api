// index.js

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const config = require('./config.json');

const chatRoutes = require('./routes/chatRoutes'); // chat-related routes
const ragRoutes = require('./routes/ragRoutes');

//const port = process.env.PORT || 3000;
const port = process.env.PORT || 7032;
const app = express();

console.log('Using port', port);

// Middleware setup
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON requests

// Simple route to test API functionality
app.get('/', (req, res) => {
    res.send('Welcome to my API');
});

// Register chat-related routes with the Express app
app.use('/chatbrc', chatRoutes);

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

