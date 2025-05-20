// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const authenticate = require('../middleware/auth');
const ChatService = require('../services/chatService');

const router = express.Router();

// ========== CHAT ==========
router.post('/chat', authenticate, async (req, res) => {
    try {
        const response = await ChatService.handleChatRequest(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// ========== CHAT + Image ==========
router.post('/chat-image', authenticate, async (req, res) => {
    try {
        const response = await ChatService.handleChatImageRequest(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// ========== RAG ==========
router.post('/rag', authenticate, async (req, res) => {
    try {
        const response = await ChatService.handleRagRequest(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// ========== LAMBDA DEMO ==========
router.post('/olek-demo', authenticate, async (req, res) => {
    try {
        const { text, rag_flag } = req.body;
        const lambdaResponse = await ChatService.handleLambdaDemo(text, rag_flag);
        res.status(200).json({ content: lambdaResponse });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal server error in demo', error });
    }
});

// ========== SESSION ROUTES ==========
router.get('/start-chat', authenticate, (req, res) => {
    const sessionId = uuidv4();
    res.status(200).json({ message: 'created session id', session_id: sessionId });
});

router.get('/get-session-messages', authenticate, async (req, res) => {
    try {
        const session_id = req.query.session_id;
        if (!session_id) {
            return res.status(400).json({ message: 'session_id is required' });
        }

        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const messages = await chatCollection.find({ session_id }).sort({ timestamp: -1 }).toArray();
        res.status(200).json({ messages });
    } catch (error) {
        console.error('Error retrieving session messages:', error);
        res.status(500).json({ message: 'Failed to retrieve session messages', error: error.message });
    }
});

router.get('/get-session-title', authenticate, async (req, res) => {
    try {
        const session_id = req.query.session_id;
        if (!session_id) {
            return res.status(400).json({ message: 'session_id is required' });
        }

        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const title = await chatCollection.find({ session_id }).project({ title: 1 }).toArray();
        res.status(200).json({ title });
    } catch (error) {
        console.error('Error retrieving session title:', error);
        res.status(500).json({ message: 'Failed to retrieve session title', error: error.message });
    }
});

router.get('/get-all-sessions', authenticate, async (req, res) => {
    try {
        const user_id = req.query.user_id;
        if (!user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const sessions = await chatCollection.find({ user_id }).sort({ created_at: -1 }).toArray();
        res.status(200).json({ sessions });
    } catch (error) {
        console.error('Error retrieving chat sessions:', error);
        res.status(500).json({ message: 'Failed to retrieve chat sessions', error: error.message });
    }
});

router.post('/put-chat-entry', async (req, res) => {
    console.log('Inserting chat entry');
    console.log(req.body);
    // Implement insertion logic
});

router.post('/generate-title-from-messages', authenticate, async (req, res) => {
    try {
        const { model, messages, user_id } = req.body;
        const message_str = messages.map(msg => `message: ${msg}`).join('\n\n');
        const query = `Provide a very short, concise, descriptive title based on the content of the messages:\n\n${message_str}`;

        const db = await connectToDatabase();
        const modelCollection = db.collection('modelList');
        const modelData = await modelCollection.findOne({ model });

        const queryType = modelData['queryType'];
        let response;

        if (queryType === 'client') {
            const openai_client = ChatService.getOpenaiClient(modelData);
            const queryMsg = [{ role: 'user', content: query }];
            response = await ChatService.queryModel(openai_client, model, queryMsg);
        } else if (queryType === 'request') {
            response = await ChatService.queryRequest(modelData.endpoint, model, '', query);
        } else {
            return res.status(500).json({ message: 'Invalid query type', queryType });
        }

        res.status(200).json({ message: 'success', response });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/update-session-title', authenticate, async (req, res) => {
    try {
        const { title, session_id, user_id } = req.body;
        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const updateResult = await chatCollection.updateOne(
            { session_id, user_id },
            { $set: { title } }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Session not found or user not authorized' });
        }

        res.status(200).json({ message: 'Session title updated successfully' });
    } catch (error) {
        console.error('Error updating session title:', error);
        res.status(500).json({ message: 'Failed to update session title', error: error.message });
    }
});

router.post('/delete-session', authenticate, async (req, res) => {
    try {
        const { session_id, user_id } = req.body;
        if (!session_id) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const deleteResult = await chatCollection.deleteOne({ session_id, user_id });

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({ message: 'Session not found' });
        }

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ message: 'Failed to delete session', error: error.message });
    }
});

router.get('/get-user-prompts', authenticate, async (req, res) => {
    try {
        const user_id = req.query.user_id;
        const db = await connectToDatabase();
        const promptsCollection = db.collection('testPrompts');

        const prompts = await promptsCollection.find({ user_id }).sort({ created_at: -1 }).toArray();
        res.status(200).json({ prompts });
    } catch (error) {
        console.error('Error getting user prompts:', error);
        res.status(500).json({ message: 'Failed getting user prompts', error: error.message });
    }
});

router.post('/save-prompt', authenticate, async (req, res) => {
    try {
        const { name, text, user_id } = req.body;
        const db = await connectToDatabase();
        const promptsCollection = db.collection('testPrompts');

        const updateResult = await promptsCollection.updateOne(
            { user_id },
            { $push: { saved_prompts: { title: name, text } } }
        );

        res.status(200).json({ update_result: updateResult, title: name, content: text });
    } catch (error) {
        console.error('Error saving user prompt:', error);
        res.status(500).json({ message: 'Failed saving user prompt', error: error.message });
    }
});

// ========== SIMPLIFIED CHAT ==========
router.post('/chat-only', authenticate, async (req, res) => {
    try {
        const { query, model, system_prompt } = req.body;
        if (!query || !model) {
            return res.status(400).json({ message: 'query and model are required' });
        }

        const response = await ChatService.handleChatQuery({ query, model, system_prompt });
        res.status(200).json({ message: 'success', response });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

module.exports = router;
