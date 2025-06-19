// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const ChatService = require('../services/chatService');
const {
  getModelData,
  getSessionMessages,
  getSessionTitle,
  getUserSessions,
  updateSessionTitle,
  deleteSession,
  getUserPrompts,
  saveUserPrompt,
  rateConversation,
  rateMessage
} = require('../services/dbUtils');
const authenticate = require('../middleware/auth');
const router = express.Router();

// ========== MAIN CHAT ROUTES ==========
router.post('/chat', authenticate, async (req, res) => {
    try {
        const { query, model, session_id, user_id, system_prompt, save_chat = true } = req.body;
        const response = await ChatService.handleChatRequest({ 
            query, 
            model, 
            session_id, 
            user_id, 
            system_prompt, 
            save_chat 
        });
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/rag', authenticate, async (req, res) => {
    try {
        const { query, rag_db, user_id, model, num_docs, session_id } = req.body;
        const response = await ChatService.handleRagRequest({ query, rag_db, num_docs, user_id, model, session_id });
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/rag-distllm', authenticate, async (req, res) => {
    try {
        const { query, rag_db, user_id, model, num_docs, session_id } = req.body;
        const response = await ChatService.handleRagRequestDistllm({ query, rag_db, user_id, model, num_docs, session_id });
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/chat-image', authenticate, async (req, res) => {
    try {
        const { query, model, session_id, user_id, system_prompt, save_chat = true, image } = req.body;
        // const image = req.file ? req.file.buffer.toString('base64') : null;
        const response = await ChatService.handleChatImageRequest({ 
            query, 
            model, 
            session_id, 
            user_id, 
            image, 
            system_prompt, 
            save_chat 
        });
        res.status(200).json(response);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/demo', authenticate, async (req, res) => {
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

        const messages = await getSessionMessages(session_id);
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

        const title = await getSessionTitle(session_id);
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

        const sessions = await getUserSessions(user_id);
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
        const query = `Provide a very short, concise, descriptive title based on the content ` +
            `of the messages. Only return the title, no other text.\n\n${message_str}`;

        const modelData = await getModelData(model);
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
        const updateResult = await updateSessionTitle(session_id, user_id, title);

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

        const deleteResult = await deleteSession(session_id, user_id);

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
        const prompts = await getUserPrompts(user_id);
        res.status(200).json({ prompts });
    } catch (error) {
        console.error('Error getting user prompts:', error);
        res.status(500).json({ message: 'Failed getting user prompts', error: error.message });
    }
});

router.post('/save-prompt', authenticate, async (req, res) => {
    try {
        const { name, text, user_id } = req.body;
        const updateResult = await saveUserPrompt(user_id, name, text);
        res.status(200).json({ update_result: updateResult, title: name, content: text });
    } catch (error) {
        console.error('Error saving user prompt:', error);
        res.status(500).json({ message: 'Failed saving user prompt', error: error.message });
    }
});

router.post('/rate-conversation', authenticate, async (req, res) => {
    try {
        const { session_id, user_id, rating } = req.body;
        
        // Validate required fields
        if (!session_id || !user_id || rating === undefined) {
            return res.status(400).json({ 
                message: 'session_id, user_id, and rating are required' 
            });
        }
        
        // Validate rating value (assuming 1-5 scale)
        if (typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ 
                message: 'Rating must be a number between 1 and 5' 
            });
        }
        
        const result = await rateConversation(session_id, user_id, rating);
        
        res.status(200).json({ 
            message: 'Conversation rated successfully',
            session_id,
            rating 
        });
    } catch (error) {
        console.error('Error rating conversation:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

router.post('/rate-message', authenticate, async (req, res) => {
    try {
        const { user_id, message_id, rating } = req.body;
        
        // Validate required fields
        if (!user_id || !message_id || rating === undefined) {
            return res.status(400).json({ 
                message: 'user_id, message_id, and rating are required' 
            });
        }
        
        // Validate rating value: -1, 0, 1
        if (typeof rating !== 'number' || rating < -1 || rating > 1) {
            return res.status(400).json({ 
                message: 'Rating must be a number between -1 and 1' 
            });
        }
        
        const result = await rateMessage(user_id, message_id, rating);
        
        res.status(200).json({ 
            message: 'Message rated successfully',
            user_id,
            message_id,
            rating 
        });
    } catch (error) {
        console.error('Error rating message:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

// ========== SIMPLIFIED CHAT ==========
router.post('/chat-only', authenticate, async (req, res) => {
    try {
        const { query, model, system_prompt } = req.body;
        if (!query || !model) {
            return res.status(400).json({ message: 'query and model are required' });
        }

        const response_json = await ChatService.handleChatQuery({ query, model, system_prompt });
        res.status(200).json({ message: 'success', response:response_json });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

// ========== Data Utils ==========
router.post('/get-path-state', authenticate, async (req, res) => {
    try {
        const { path } = req.body;
        const pathState = await ChatService.getPathState(path);
        res.status(200).json({ message: 'success', pathState });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});


module.exports = router;
