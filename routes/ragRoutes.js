// routes/chatRoutes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { OpenAI } = require('openai');
const { ChromaClient } = require("chromadb");
const { connectToDatabase } = require('../database'); // Importing database connection function
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

// OpenAI client setup for embeddings

const model = config['ragModel'];
const openai_client = new OpenAI({
    apiKey: 'EMPTY',
    baseURL: config['ragUrl']
});


const valid_rag_dbs = ['cancer_papers'];

/**
 * Handle chat message with LLM server
 * - Sends user message to LLM
 * - Stores user message and LLM response in MongoDB
 */
router.post('/chat', authenticate, async (req, res) => {
    // chroma client
    const chroma = new ChromaClient({ path: config['chroma_db_url'] });

    console.log('rag method triggered');
    const { query, rag_db, user_id } = req.body;

    if (!valid_rag_dbs.includes(rag_db)) {
        res.status(400).json({ message: `Invalid rag_db: ${rag_db}` });
    }

    try {
        const collection = await chroma.getCollection({ name: rag_db })
        //const collection = await chroma.countCollections()
        

        // Prepare context history if session exists
        let prompt_query = query;

        // Query the vector database

        // Get query embeddings 
        const emb_res = await openai_client.embeddings.create({
            model: model,
            input: query 
        });
        console.log('emb_res = ', emb_res);
        const query_embeddings = emb_res.data[0].embedding;

        // pass embeddings to chromadb and get documents
        const results = await collection.query({
            queryEmbeddings: [query_embeddings],
            nResults: 5
        });

        console.log('chroma query results = ', results);
        res.status(200).json({ message: 'success', documents: results['documents'] });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    }
});

module.exports = router;

