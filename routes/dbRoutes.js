// routes/dbRoutes.js

const express = require('express');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const { connectToDatabase } = require('../database');
const config = require('../config.json');
const router = express.Router();
const authenticate = require('../middleware/auth');

/* I don't think I need these functions

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

async function queryRequest(url, model, system_prompt, query) {
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
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const llmData = await response.json();

        return llmData.response; // Assuming 'response' is a key in the returned JSON
    } catch (error) {
        console.error('Error during queryRequest:', error);
        throw error; // Re-throw the error for the caller to handle
    }
}

async function getModels(db) {
    try {
        const modelCollection = db.collection('modelList');
        const all_models = await modelCollection.find({}).toArray();

        const activeModels = [];
        for (const model of all_models) {
            var use_client = model['queryType'] == 'client';
            var isActive = false;
            if (use_client) { // openai client
                const curr_client = setupOpenaiClient(model['apiKey'],model['endpoint']);
                const llmMessages = [{'role':'user', content:'Are you awake?'}];
                isActive = await queryClient(curr_client, model['model'], llmMessages);
            } else { // general request
                isActive = await queryRequest(model['endpoint'], model['model'], '', 'Are you awake?');
            }
            if (isActive) {
                activeModels.push(model);
            }
        }

        return activeModels;
    } catch (error) {
        console.error('Error getting active models:', error);
        return [];
    }
}

*/

// TODO: add an extra params argument or something?
// - want to enable a parameter that allows for extra filtering, passed by the front end
//      without bulking up this function
// TODO: also decide between using camel case or underscores in the mongodb.
//  Using one of each is dumb
router.post('/get-model-list', authenticate, async (req, res) => {
    try {
        const project_id = req.body; 
        var pid = null;
        if (project_id) {
            pid = project_id
        }
        const db = await connectToDatabase();
        const modelCollection = db.collection('modelList');
        // TODO: incorporate filtering by project
        const all_models = await modelCollection.find({active: true, model_type: 'chat'}).sort({ priority: 1 }).toArray();        
        console.log(JSON.stringify(all_models));
        const ragCollection = db.collection('ragList');
        // TODO: incorporate filtering by project
        const all_rags = await ragCollection.find({active: true}).sort({ priority: 1 }).toArray();
        console.log(JSON.stringify(all_rags));
        res.status(200).json({models: JSON.stringify(all_models), vdb_list: JSON.stringify(all_rags) });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    } 
});

module.exports = router;
