// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');
const { connectToDatabase } = require('../database'); // Importing database connection function
const config = require('../config.json');
const router = express.Router();

// OpenAI client setup
const model = config['model'];
const openai_client = new OpenAI({
    apiKey: config['openaiApiKey'],
    baseURL: config['openaiBaseUrl']
});

/**
 * Handle chat message with LLM server
 * - Sends user message to LLM
 * - Stores user message and LLM response in MongoDB
 */
router.post('/copilot-chat', async (req, res) => {
    console.log('chat method triggered');
    const { query, session_id, user_id } = req.body;

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
router.get('/start-chat', (req, res) => {
    const sessionId = uuidv4();
    console.log('Starting new session:', sessionId);
    res.status(200).json({ message: 'created session id', session_id: sessionId });
});

/**
 * Retrieve chat history by session ID
 */
router.get('/get-session-messages', async (req, res) => {
    console.log('Retrieving chat history');

    const session_id = req.query.session_id;
    console.log('session_id = ', session_id);

    if (!session_id) {
        return res.status(400).json({ message: 'session_id is required' });
    }

    try {
        // Connect to the database and get the collection
        const db = await connectToDatabase(); // Assuming connectToDatabase is defined elsewhere
        const chatsCollection = db.collection('test1');

        // Query for session messages
        // TODO: check user is correct too
        // getSessionMessages
        const messages = await chatsCollection.find({ session_id: session_id })
                                .sort({ timestamp: -1 }) // sort by recent first
                                .toArray();

        // Return session messages to client
        res.status(200).json({ messages });
    } catch (error) {
        console.error('Error retrieving session messages:', error);
        res.status(500).json({ message: 'Failed to retrieve session messages', error: error.message });
    }
});

/**
 * Retrieve all session IDs for a user
 */
router.get('/get-all-sessions', async (req, res) => {
    console.log('Retrieving all chat sessions');

    // Extract user_id from query parameters or headers (adjust as needed)
    const user_id = req.query.user_id;
    console.log('user_id', user_id);

    // Validate that user_id is provided
    if (!user_id) {
        return res.status(400).json({ message: 'user_id is required' });
    }

    try {
        // Connect to the database and get the collection
        const db = await connectToDatabase(); // Assuming connectToDatabase is defined elsewhere
        const chatsCollection = db.collection('test1');

        // Query for all sessions with the provided user_id
        const sessions = await chatsCollection.find({ user_id: user_id })
            .sort({ created_at: -1 }) // Sort by most recent sessions first
            .toArray();

        // Return the sessions to the client
        res.status(200).json({ sessions });

    } catch (error) {
        console.error('Error retrieving chat sessions:', error);
        res.status(500).json({ message: 'Failed to retrieve chat sessions', error: error.message });
    }
});

/**
 * Insert a chat entry into the database
 */
router.post('/put-chat-entry', async (req, res) => {
    console.log('Inserting chat entry');
    console.log(req.body);
    // Implement insertion logic
});

/**
 * Generate a session title from the initial prompt
 */
router.post('/generate-title', async (req, res) => {
    console.log('Generating session title');

    const query = `Provide a concise, descriptive title based on the content of the text:\n\n${req.body.content}`;
    console.log('req = ', req.body);

    try {
        const llm_res = await openai_client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: query }]
        });
        const response = llm_res.choices[0].message;
        res.status(200).json({ message: 'success', response });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

module.exports = router;

