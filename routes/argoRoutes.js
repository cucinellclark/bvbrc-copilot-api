// routes/argoRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
// const { OpenAI } = require('openai');
//const fetch = require('node-fetch');
const fetch = require('node-fetch');
const { connectToDatabase } = require('../database'); // Importing database connection function
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

const argoUrl = config['argoUrl'];
const argoModel = config['argoModel'];


// routes

/*
router.get('/check', authenticate, async (req, res) => {
    console.log('hit');
    // res.status(200).json({ message: 'success' });
    const data = {
        model: "gpt4o",
        system: "helpful AI",
        prompt: ['Why is the sky blue?'],
        user: "cucinell",
        temperature: 0.0
    };

    fetch(argoUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(llmData => {
        res.status(200).json({ message: 'success', content: llmData['response']});
    })
    .catch(error => {
        console.error('error = ', error);
        res.status(500).json({ message: 'fail', content: 'check logs'});
    });
});
*/

router.post('/chat', authenticate, async (req, res) => {
    console.log('chat method triggered');
    // console.log('req = ', req);
    const { query, session_id, user_id, system_prompt } = req.body;

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

        // Create user message object
        const userMessage = { message_id: uuidv4(), role: 'user', content: query, timestamp: new Date() };

        // const llmMessages = [];
        // if (system_prompt) {
        //     llmMessages.push({ role: 'system', content: system_prompt });
        // }
        // llmMessages.push({ role: 'user', content: prompt_query });
        if (!system_prompt) {
            const system_prompt = '';
        } 

        const data = {
            model: "gpt4o",
            system: system_prompt,
            prompt: [prompt_query],
            user: "cucinell",
            temperature: 0.0
        };
        fetch(argoUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).then(response => response.json())
        .then(async (llmData) => {
            const responseMessage = llmData['response'];
            console.log('responseMessage = ', responseMessage);

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
            // Create response message object
            const assistantMessage = { message_id: uuidv4(), role: 'assistant', content: responseMessage, timestamp: new Date() };

            // Save messages to database
            await chatsCollection.updateOne(
                { session_id },
                { $push: { messages: { $each: [userMessage, assistantMessage] } } }
            );

            const resData = {
                content: responseMessage,
                role: 'assistant',
                tool_calls: []
            };
            res.status(200).json({ message: 'success', response: resData });

            })
            .catch(error => {
                console.log('error = ', error);
            });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

module.exports = router;

