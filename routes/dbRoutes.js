// routes/dbRoutes.js

const express = require('express');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const { connectToDatabase } = require('../database');
const { getActiveModels, getActiveRagDatabases } = require('../services/dbUtils');
const router = express.Router();
const authenticate = require('../middleware/auth');

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
        
        // TODO: incorporate filtering by project
        const all_models = await getActiveModels('chat');
        console.log(JSON.stringify(all_models));
        
        // TODO: incorporate filtering by project
        const all_rags = await getActiveRagDatabases();
        console.log(JSON.stringify(all_rags));
        
        res.status(200).json({models: JSON.stringify(all_models), vdb_list: JSON.stringify(all_rags) });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Internal server error', error });
    } 
});

module.exports = router;
