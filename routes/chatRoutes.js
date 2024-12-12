// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');
const { connectToDatabase } = require('../database'); // Importing database connection function
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

// OpenAI client setup
const model = config['model'];
const openai_client = new OpenAI({
    apiKey: config['openaiApiKey'],
    baseURL: config['otherUrl']
});

/**
 * Handle chat message with LLM server
 * - Sends user message to LLM
 * - Stores user message and LLM response in MongoDB
 */
router.post('/copilot-chat', authenticate, async (req, res) => {
    console.log('chat method triggered');
    const { query, session_id, user_id, system_prompt } = req.body;

    try {
        const db = await connectToDatabase();
        const chatsCollection = db.collection('test1');
        const session = await chatsCollection.findOne({ session_id });

        // Prepare context history if session exists
        let prompt_query = query;
        if (session) {
            const messages = session.messages.map(m => `${m.role}: ${m.content}`).join('\n');
            prompt_query = `Previous conversation:\n${messages}\n\nNew query:\n${query}\n\n`;
        }
        
        // create user message object
        const userMessage = { message_id: uuidv4(), role: 'user', content: query, timestamp: new Date() };

        // setup the messages
        const llmMessages = [];
        if (system_prompt) {
            llmMessages.push({ role: 'system', content: system_prompt });
        }
        llmMessages.push({ role: 'user', content: prompt_query });

        // Get response from LLM
        const llm_res = await openai_client.chat.completions.create({
            model,
            messages: llmMessages 
        });
        const response = llm_res.choices[0].message;

        // Create response message object
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

router.post('/argo-chat', authenticate, async (req, res) => {
    console.log('argo chat triggered');
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
        const llm_res = await argo_client.chat.completions.create({
            model: argoModel,
            prompt: [prompt_query]
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

/**
 * Retrieve chat history by session ID
 */
router.get('/get-session-messages', authenticate, async (req, res) => {
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
router.get('/get-all-sessions', authenticate, async (req, res) => {
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
 * Generate a title from a set of messages 
 */
router.post('/generate-title-from-messages', authenticate, async (req, res) => {
    console.log('Generating session title');
    const { messages, user_id } = req.body;
    const message_str = messages.map(msg => `message: ${msg}`).join('\n\n');
    const query = `Provide a concise, descriptive title based on the content of the messages:\n\n${message_str}`;

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

/**
 * Update the session title for a given session_id
 */
router.post('/update-session-title', authenticate, async (req, res) => {

    console.log('updating session title');
    const { title, session_id, user_id } = req.body;

    try {
        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const chatsCollection = db.collection('test1');

        console.log('session_id = ', session_id);
        console.log('user_id = ', user_id);
        console.log('title = ', title);

        // Update the session title for the specified session_id and user_id
        const updateResult = await chatsCollection.updateOne(
            { session_id: session_id, user_id: user_id },
            { $set: { title: title } }
        );

        // Check if the session was found and updated
        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Session not found or user not authorized' });
        }

        // Respond with a success message
        res.status(200).json({ message: 'Session title updated successfully' });
    } catch (error) {
        console.error('Error updating session title:', error);
        res.status(500).json({ message: 'Failed to update session title', error: error.message });
    }
});

/**
 * Delete a session by session_id
 * TODO: UNTESTED
 */
router.post('/delete-session', authenticate, async (req, res) => {
    console.log('Deleting session');
    const { session_id, user_id } = req.body;
    console.log('session_id = ',session_id);
    try {
        if (!session_id) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const chatsCollection = db.collection('test1');

        const deleteResult = await chatsCollection.deleteOne({ session_id, user_id });
        console.log('here3=',deleteResult);

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Respond with a success message
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ message: 'Failed to delete session', error: error.message });
    }
});


/**
 * Get user prompts
 */
router.get('/get-user-prompts?', authenticate, async (req, res) => {
    console.log('get user prompts');
    const user_id = req.query.user_id;

    try {
        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const promptsCollection = db.collection('testPrompts');

        // Query for all prompts with the provided user_id
        const prompts = await promptsCollection.find({ user_id: user_id })
            .sort({ created_at: -1 }) // Sort by most recent sessions first
            .toArray();

        // Return the sessions to the client
        res.status(200).json({ prompts: prompts });

    } catch (error) {
        console.error('Error getting user prompts:', error);
        res.status(500).json({ message: 'Failed getting user prompts', error: error.message });
    }
});

/**
 * Svae a user prompt
 */
router.post('/save-prompt', authenticate, async (req, res) => {
    console.log('save user prompt');
    const { name, text, user_id } = req.body;

    try {
        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const promptsCollection = db.collection('testPrompts');

        // Update the session title for the specified session_id and user_id
        const updateResult = await promptsCollection.updateOne(
            { user_id: user_id },
            { $push: { saved_prompts: { title: name, text: text } } }
        );

        // Return the sessions to the client
        res.status(200).json({ update_result: updateResult, title: name, content: text });

    } catch (error) {
        console.error('Error getting user prompts:', error);
        res.status(500).json({ message: 'Failed getting user prompts', error: error.message });
    }
});

module.exports = router;

