// index.js

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const config = require('./config.json');

const chatRoutes = require('./routes/chatRoutes'); // Importing chat-related routes
const argoRoutes = require('./routes/argoRoutes');

//const port = process.env.PORT || 3000;
const port = process.env.PORT || 7032;
const app = express();

console.log('Using port', port);

// Middleware setup
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON requests

// OpenAI client setup
const model = config['model'];
const openai_client = new OpenAI({
    apiKey: config['openaiApiKey'],
    baseURL: config['openaiBaseUrl']
});

// Simple route to test API functionality
app.get('/', (req, res) => {
    res.send('Welcome to my API');
});

// Register chat-related routes with the Express app
app.use('/', chatRoutes);
app.use('/argo', argoRoutes);

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

