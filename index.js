// index.js

const express = require('express');
const app = express();
const { OpenAI } = require('openai');
const port = process.env.PORT || 8492;

// Middleware to parse JSON requests
app.use(express.json());

const config = require('./config.json');

// add openai client
const model = config['model'];
const openai_client = new OpenAI({
    apiKey: config['openaiApiKey'], 
   baseURL: config['openaiBaseUrl'] 
});

// Simple route to test the API
app.get('/', (req, res) => {
  res.send('Welcome to my API');
});

// Route to handle POST request to add a user
app.post('/api/user', (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Imagine here you'd save the user to a database
  res.status(201).json({ message: `User ${name} created with email ${email}` });
});


app.post('/copilot/chat', async (req, res) => {

    const llm_res = await openai_client.chat.completions.create({
        'model': model, 
        'messages': [{'role': 'user', 'content': 'Hello, tell me about BV-BRC'}]
    }).catch(function (error) {
        console.log('error = ',error);
    });
    console.log(llm_res.choices[0].message);
    response = llm_res.choices[0].message

    res.status(400).json({ message: 'llm query success', externalApiResponse: response});
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

