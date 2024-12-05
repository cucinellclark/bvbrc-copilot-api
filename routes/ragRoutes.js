// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');
const { connectToDatabase } = require('../database'); // Importing database connection function
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

// OpenAI client setup
const model = config['ragModel'];
const openai_client = new OpenAI({
    apiKey: config['openaiApiKey'],
    baseURL: config['ragUrl']
});

/**
 * Handle chat message with LLM server
 * - Sends user message to LLM
 * - Stores user message and LLM response in MongoDB
 */
router.post('/rag-chat', authenticate, async (req, res) => {
    console.log('chat method triggered');
    const { query, rag_db, session_id, user_id } = req.body;

    try {
        const db = await connectToDatabase();
        const chatsCollection = db.collection('test1');
        const session = await chatsCollection.findOne({ session_id });

        // Prepare context history if session exists
        let prompt_query = query;
        if (session) {
            const messages = session.messages.map(m => `${m.role}: ${m.content}`).join('\n');
            prompt_query = `Previous conversation:\n${messages}\n\n${query}`;
        }

        // Get response from LLM
        const llm_res = await openai_client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt_query }]
        });
        const response = llm_res.choices[0].message;

        // Create message objects
        const userMessage = { message_id: uuidv4(), role: 'user', content: query, timestamp: new Date() };
        const assistantMessage = { message_id: uuidv4(), role: 'assistant', content: response.content, timestamp: new Date() };

        // Create or update session in MongoDB
        if (!session) {
            await chatsCollection.insertOne({
                session_id,
                user_id,
                title: 'Untitled',
                created_at: new Date(),
                messages: []
            });
            console.log('New session created:', session_id);
        }

        // Save messages to database
        await chatsCollection.updateOne(
            { session_id },
            { $push: { messages: { $each: [userMessage, assistantMessage] } } }
        );

        res.status(200).json({ message: 'success', response });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

/**
 * Generate a new unique session ID
 */
router.get('/start-chat', authenticate, (req, res) => {
    const sessionId = uuidv4();
    console.log('Starting new session:', sessionId);
    res.status(200).json({ message: 'created session id', session_id: sessionId });
});

module.exports = router;

