// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const { ChromaClient } = require("chromadb"); // TODO: Maybe change out for bob's mysql database
const { connectToDatabase } = require('../database'); // Importing database connection function
// const { classifyText } = require("../utilities/classify.js");
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

// OpenAI client setup
function setupOpenaiClient(apikey, url) {
    try {
        const openai_client = new OpenAI({
            apiKey: apikey,
            baseURL: url
        });
        return openai_client; 
    } catch (error) {
        console.error('Error during setupOpenaiClient: ', error);
        return null;
    }
}

// OpenAI client llm query
async function queryClient(openai_client, model, llmMessages) {
    try {
        console.log('model = ', model);
        console.log('messages = ', llmMessages);
        const llm_res = await openai_client.chat.completions.create({
            model,
            messages: llmMessages
        });
        //console.log(llm_res.choices[0].message.content);
        const response = llm_res.choices[0].message.content;
        return response;
    } catch (error) {
        console.error('Error during queryClient: ', error);
        return null;
    }
}

// user because the only one working right now is argo
async function queryRequestChat(url, model, system_prompt, query) {
    if (model == 'gpt4o') { // Argo format
        const response = await queryRequestChatArgo(modelData['endpoint'], model, '', query);
        return response;
    } else {
        try {
            console.log('model = ', model);
            
            const data = {
                model: model,
                messages: [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': query}
                ],
                temperature: 1.0
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}\nReason: ${response.reason}`);
            }

            const llmData = await response.json();
            const response_text = llmData.choices[0].message.content;
            console.log('text = ', response_text);

            return response_text; // Assuming 'response' is a key in the returned JSON
        } catch (error) {
            console.error('Error during queryRequestChat:', error);
            throw error; // Re-throw the error for the caller to handle
        }
    }
}

// user because the only one working right now is argo
async function queryRequestChatArgo(url, model, system_prompt, query) {
    try {
        console.log('model = ', model);

        const data = {
            model: model,
            system: system_prompt,
            prompt: [query],
            user: "cucinell",
            temperature: 1.0
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}\nReason: ${response.reason}`);
        }

        const llmData = await response.json();

        return llmData.response; // Assuming 'response' is a key in the returned JSON
    } catch (error) {
        console.error('Error during queryRequestChat:', error);
        throw error; // Re-throw the error for the caller to handle
    }
}

async function queryRequestEmbedding(url, model, apiKey, query) {
    try {
        const data = {
            model: model,
            input: query
        };
        const headers = {
            'Content-Type': 'application/json'
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: headers, 
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}\nReason: ${response.reason}`);
        }

        const embeddingRes = await response.json();

        const embeddings = embeddingRes['data'][0]['embedding'];

        return embeddings;
    } catch (error) {
        console.error('Error during queryRequestEmbedding:', error);
        throw error; // Re-throw the error for the caller to handle
    }
}

async function queryRequestEmbeddingTfidf(query, vectorizer, model_endpoint) {
    if (!query) {
        return { error: "Query is required" };
    }
    if (!vectorizer) {
        return { error: "Vectorizer name is required" };
    }

    try {
        const response = await fetch(model_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                'query': query,
                'vectorizer': vectorizer 
            }),
        });

        if (!response.ok) {
            throw new Error(`Flask API error: ${response.statusText}`);
        }

        const data = await response.json();
        const embeddings = data['query_embedding'][0]
        console.log('embeddings2 = ', embeddings);
        return embeddings 
    } catch (error) {
        console.error(error);
        return{ error: "Internal Server Error" };
    }
}

router.post ('/chat', authenticate, async (req, res) => {
    try {
        const { query, model, session_id, user_id, system_prompt } = req.body;

        const db = await connectToDatabase();
        const modelCollection = db.collection('modelList');
        const chatCollection = db.collection('test1');
        const chatSession = await chatCollection.findOne({ session_id });
        const modelData = await modelCollection.findOne({ model }); 

        // TODO: move to a different spot or use different model?
        // Classify query: Function calling 
        // var classification = await classifyText(query); 
        // console.log('/**** classification = ', classification);

        let prompt_query = query;
        if (chatSession) {
            const messages = chatSession.messages.map(m => `${m.role}: ${m.content}`).join('\n');
            prompt_query = `Previous conversation:\n${messages}\n\nNew query:\n${query}\n\n`;
        }

        // check models match
        if (!modelData) {
            res.status(500).json({ message: 'Model incorrect: ', model});
        }

        // create user message object
        const userMessage = { message_id: uuidv4(), role: 'user', content: query, timestamp: new Date() };

        // setup the messages
        const llmMessages = [];
        var request_sysprompt = '';
        var systemMessage = null;
        if (system_prompt) {
            llmMessages.push({ role: 'system', content: system_prompt });
            request_sysprompt = system_prompt;
            systemMessage = { message_id: uuidv4(), role: 'system', content: system_prompt, timestamp: new Date() }; 
        }
        llmMessages.push({ role: 'user', content: prompt_query });

        // Get response from LLM
        console.log('modelData', modelData);
        const queryType = modelData['queryType'];
        var response = '';
        console.log('queryType = ', queryType);
        if (queryType == 'client') {
            const openai_client = setupOpenaiClient(modelData['apiKey'], modelData['endpoint']);
            response = await queryClient(openai_client, model, llmMessages);
        }
        else if (queryType == 'request') {
            console.log('request');
            response = await queryRequestChat(modelData['endpoint'], model, request_sysprompt, prompt_query);
        } else {
            res.status(500).json({ message: 'Invalid query type: ', queryType });
        }

        // Create response message object
        const assistantMessage = { message_id: uuidv4(), role: 'assistant', content: response, timestamp: new Date() };

        // Create or update session in MongoDB
        if (!chatSession) {
            await chatCollection.insertOne({
                session_id,
                user_id,
                title: 'Untitled',
                created_at: new Date(),
                messages: []
            });
            console.log('New session created:', session_id);
        }

        // Save messages to database
        if (systemMessage) {
            await chatCollection.updateOne(
                { session_id },
                { $push: { messages: { $each: [userMessage, systemMessage, assistantMessage] } } }
            );
        } else {
            await chatCollection.updateOne(
                { session_id },
                { $push: { messages: { $each: [userMessage, assistantMessage] } } }
            );
        }
        res.status(200).json({ message: 'success', response });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

router.post('/rag', authenticate, async (req, res) => {
    console.log('rag method triggered');
    const { query, rag_db, user_id, model } = req.body;

    try {
        const db = await connectToDatabase();
        // const modelCollection = db.collection('modelList');
        const ragCollection = db.collection('ragList');
        // const modelData = await modelCollection.findOne({ model });
        const ragData = await ragCollection.findOne({ name: rag_db });
        // console.log('modeldata =', modelData);
        console.log('ragdata =', ragData);

        const embeddingEndpoint = ragData['model_endpoint'];
        const embeddingApiKey = ragData['apiKey'];
        const embeddingQueryType = ragData['queryType'];
        const embeddingModelName = ragData['model'];
        const db_url = ragData['db_endpoint'];
        const db_type = ragData['database_type'];

        // queryRequestEmbedding(url, model, apiKey, query)
        var query_embeddings = '';
        if (embeddingQueryType == 'client') {
            console.log('setup');
        }
        else if (embeddingQueryType == 'request') {
            if (embeddingModelName == 'tfidf') {
                query_embeddings = await queryRequestEmbeddingTfidf(query, rag_db, embeddingEndpoint);
            } else {
                query_embeddings = await queryRequestEmbedding(embeddingEndpoint, embeddingModelName, embeddingApiKey, query);
            }
            // query_embeddings = query_embeddings.toString();
        } else {
            res.status(500).json({ message: 'Invalid query type: ', embeddingQueryType });
        }

        // TODO: incorporate a check on query_embeddings

        // chroma client and query
        console.log('query_embeddings = ', query_embeddings);
        const chroma = new ChromaClient({ path: db_url });
        const collection = await chroma.getCollection({ name: rag_db })
        const results = await collection.query({
            queryEmbeddings: [query_embeddings],
            nResults: 3
        });

        console.log('chroma query results = ', results);
        console.log('res length = ', results.documents.length);
        res.status(200).json({ message: 'success', documents: results['documents'] });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

/* Function for Olek's demo */
// curl -X POST "http://lambda5.cels.anl.gov:8121/query" -H "Content-Type:application/json" -d'{"text": "List all alphaviruses"}'
async function queryLambdaModel(input, rag_flag) {
    const data = {
        "text": input,
        "rag_flag": rag_flag
    };
    //  "rag_flag": rag_flag
    const headers = {
        'Content-Type': 'application/json'
    };
    console.log(data);    
    const response = await fetch("http://lambda5.cels.anl.gov:8121/query", {
        method: 'POST',
        headers: headers, 
        body: JSON.stringify(data)
    });
    console.log('response ', response.ok);    

    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}\nReason: ${response.reason}`);
    }

    const response_json = await response.json();
    const answer = response_json["answer"];
    return answer;
}

router.post('/olek-demo', authenticate, async (req, res) => {
    const { text, rag_flag  } = req.body;
    console.log('body = ', req.body);

    try {
        var response = await queryLambdaModel(text, rag_flag);
        res.status(200).json({ content: response });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Internal server error in demo', error });
    }
});

/**
 * Generate a new unique session ID
 */
router.get('/start-chat', authenticate, (req, res) => {
    try {
        const sessionId = uuidv4();
        console.log('Starting new session:', sessionId);
        res.status(200).json({ message: 'created session id', session_id: sessionId });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

/**
 * Retrieve chat history by session ID
 */
router.get('/get-session-messages', authenticate, async (req, res) => {
    try {
        console.log('Retrieving chat history');

        const session_id = req.query.session_id;
        console.log('session_id = ', session_id);

        if (!session_id) {
            return res.status(400).json({ message: 'session_id is required' });
        }

        // Connect to the database and get the collection
        const db = await connectToDatabase(); // Assuming connectToDatabase is defined elsewhere
        const chatCollection = db.collection('test1');

        // Query for session messages
        // TODO: check user is correct too
        // getSessionMessages
        const messages = await chatCollection.find({ session_id: session_id })
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
    try {
        console.log('Retrieving all chat sessions');

        // Extract user_id from query parameters or headers (adjust as needed)
        const user_id = req.query.user_id;
        console.log('user_id', user_id);

        // Validate that user_id is provided
        if (!user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        // Connect to the database and get the collection
        const db = await connectToDatabase(); // Assuming connectToDatabase is defined elsewhere
        const chatCollection = db.collection('test1');

        // Query for all sessions with the provided user_id
        const sessions = await chatCollection.find({ user_id: user_id })
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
    try {
        console.log('Generating session title');
        const { model, messages, user_id } = req.body;
        const message_str = messages.map(msg => `message: ${msg}`).join('\n\n');
        const query = `Provide a concise, descriptive title based on the content of the messages:\n\n${message_str}`;
        const db = await connectToDatabase();
        const modelCollection = db.collection('modelList');
        const modelData = await modelCollection.findOne({ model });

        const queryType = modelData['queryType'];
        console.log('queryType = ', queryType);
        var response = '';
        if (queryType == 'client') {
            console.log('modelData = ', modelData);
            const openai_client = setupOpenaiClient(modelData['apiKey'], modelData['endpoint']);
            const queryMsg = [{ role: 'user', content: query }];
            response = await queryClient(openai_client, model, queryMsg);
        }
        else if (queryType == 'request') {
            console.log('request');
            response = await queryRequestChat(modelData['endpoint'], model, '', query);
        } else {
            res.status(500).json({ message: 'Invalid query type: ', queryType });
        }

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
    try {
        console.log('updating session title');
        const { title, session_id, user_id } = req.body;

        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        console.log('session_id = ', session_id);
        console.log('user_id = ', user_id);
        console.log('title = ', title);

        // Update the session title for the specified session_id and user_id
        const updateResult = await chatCollection.updateOne(
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
 */
router.post('/delete-session', authenticate, async (req, res) => {
    try {
        console.log('Deleting session');
        const { session_id, user_id } = req.body;
        console.log('session_id = ',session_id);

        if (!session_id) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        // Connect to the database and get the collection
        const db = await connectToDatabase();
        const chatCollection = db.collection('test1');

        const deleteResult = await chatCollection.deleteOne({ session_id, user_id });

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
    try {
        console.log('get user prompts');
        const user_id = req.query.user_id;

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
    try {
        console.log('save user prompt');
        const { name, text, user_id } = req.body;

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

