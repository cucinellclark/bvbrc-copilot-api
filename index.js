// index.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');

const chatRoutes = require('./routes/chatRoutes'); // chat-related routes
const dbRoutes = require('./routes/dbRoutes');
//const port = process.env.PORT || 3000;
// const port = process.env.PORT || 7032;
const app = express();

// console.log('Using port', port);

// Middleware setup
const size_limit = '50mb'
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: size_limit })); // limit: '1mb' Parse JSON requests
app.use(bodyParser.json({ limit: size_limit })); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true, limit: size_limit })); // for parsing application/x-www-form-urlencoded

//app.use(express.json({ limit: '5kb' }));
//app.use(express.urlencoded({ extended: true, limit: '5kb' }));
//console.log(app._router.stack.filter(layer => layer.name === 'jsonParser'));

// Simple route to test API functionality
app.get('/copilot-api/test', (req, res) => {
    res.send('Welcome to my API');
});

// Register chat-related routes with the Express app
app.use('/copilot-api/chatbrc', chatRoutes);
app.use('/copilot-api/db', dbRoutes);

// Start the server
// app.listen(port, () => {
//     console.log(`Server is running on port ${port}`);
// });

module.exports = app;
