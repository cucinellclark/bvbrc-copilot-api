// utilities/classify.js

const { OpenAI } = require('openai');
const fetch = require("node-fetch"); 
const config = require('../config.json');
const { connectToDatabase } = require('../database'); // Importing database connection function

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

async function classifyText(input_text) {
    try {

        const db = await connectToDatabase();
        const modelCollection = db.collection('modelList');
        const modelData = await modelCollection.findOne({ model: 'gpt4o' });

        // const openai_client = setupOpenaiClient(modelData['apiKey'], modelData['endpoint']);
        const url = modelData['endpoint'];

        if (!modelData) {
            return 'OTHER-NoModel';
        }

        const system_prompt = `You are a classifier that categorizes text into 'RAG', 'HELP', or 'OTHER'.
                                RAG is for queries about access extra data like documents.
                                HELP is for questions where the question is about direct assistance.
                                OTHER is for all other categories`;

        const data = {
            model: 'gpt4o',
            system: system_prompt,
            prompt: [input_text],
            user: "cucinell",
            temperature: 1.0,
            functions: [
                {
                    name: "classify_request",
                    description: "Classify user input into predefined categories",
                    parameters: {
                        type: "object",
                        properties: {
                            category: {
                                type: "string",
                                enum: ["RAG", "HELP", "OTHER"],
                                description: "The category of the input"
                            }
                        },
                        required: ["category"]
                    }
                }
            ],
            function_call: { name: "classify_request" }
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data)
        });

        const res_data = response.json();
        console.log('/**** res_data = ', res_data);
        if (!response.ok) throw new Error(res_data.error?.message || "LLM request failed");

        // Extract function call response
        const result = JSON.parse(res_data.choices[0].message.function_call.arguments);
        return result.category;
 
    } catch (error) {
        console.log('error = ', error);
        return "OTHER-Error"; // default fallback
    }
}

module.exports = { classifyText };
