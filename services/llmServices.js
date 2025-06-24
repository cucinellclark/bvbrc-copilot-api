// services/llmServices.js

const { OpenAI } = require('openai');
const fetch = require('node-fetch');

// ========================================
// Error Handling
// ========================================

class LLMServiceError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'LLMServiceError';
        this.originalError = originalError;
    }
}

// ========================================
// Utility Functions
// ========================================

async function postJson(url, data, apiKey = null) {
    try {
        if (!url || !data) {
            throw new LLMServiceError('Missing required parameters for postJson');
        }
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            throw new LLMServiceError(`HTTP error: ${res.status} ${res.statusText}`);
        }
        return await res.json();
    } catch (error) {
        if (error instanceof LLMServiceError) {
            throw error;
        }
        throw new LLMServiceError('Failed to make POST request', error);
    }
}

async function count_tokens(query) {
    try {
        if (!query) {
            throw new LLMServiceError('Missing query parameter for count_tokens');
        }
        const response = await postJson('http://0.0.0.0:5000/count_tokens', { query });
        if (typeof response?.token_count !== 'number') {
            throw new LLMServiceError('Invalid response format from token counting API');
        }
        return response.token_count;
    } catch (error) {
        throw new LLMServiceError('Failed to count tokens', error);
    }
}

async function safe_count_tokens(query) {
    try {
        return await count_tokens(query);
    } catch (error) {
        return 0;
    }
}

// ========================================
// OpenAI Client Functions
// ========================================

function setupOpenaiClient(apiKey, baseURL) {
    try {
        if (!apiKey) {
            throw new LLMServiceError('API key is required for OpenAI client setup');
        }
        return new OpenAI({ apiKey, baseURL });
    } catch (error) {
        throw new LLMServiceError('Failed to setup OpenAI client', error);
    }
}

async function queryClient(client, model, messages) {
    try {
        if (!client || !model || !messages) {
            throw new LLMServiceError('Missing required parameters for queryClient');
        }
        const res = await client.chat.completions.create({ model, messages });
        if (!res?.choices?.[0]?.message?.content) {
            throw new LLMServiceError('Invalid response format from OpenAI API');
        }
        return res.choices[0].message.content;
    } catch (error) {
        throw new LLMServiceError('Failed to query OpenAI client', error);
    }
}

// ========================================
// Chat API Functions
// ========================================

async function queryRequestChat(url, model, system_prompt, query) {
    try {
        if (!url || !model || !query) {
            throw new LLMServiceError('Missing required parameters for queryRequestChat');
        }
        var payload = {
            model, temperature: 1.0,
            messages: [{ role: 'system', content: system_prompt }, { role: 'user', content: query }]
        }        
        return model === 'gpt4o'
            ? await queryRequestChatArgo(url, model, system_prompt, query)
            : await postJson(url, payload).then(res => {
                if (!res?.choices?.[0]?.message?.content) {
                    throw new LLMServiceError('Invalid response format from chat API');
                }
                return res.choices[0].message.content;
            });
    } catch (error) {
        throw new LLMServiceError('Failed to query chat API', error);
    }
}

async function queryRequestChatArgo(url, model, system_prompt, query) {
    try {
        if (!url || !model || !system_prompt || !query) {
            throw new LLMServiceError('Missing required parameters for queryRequestChatArgo');
        }
        const res = await postJson(url, {
            model,
            prompt: [query],
            system: system_prompt,
            user: "cucinell",
            temperature: 1.0
        });
        if (!res?.response) {
            throw new LLMServiceError('Invalid response format from Argo API');
        }
        return res.response;
    } catch (error) {
        throw new LLMServiceError('Failed to query Argo API', error);
    }
}

async function queryChatOnly({ query, model, system_prompt = '', modelData }) {
    try {
        if (!query || !model || !modelData) {
            throw new LLMServiceError('Missing required parameters for queryChatOnly');
        }

        const llmMessages = [];
        if (system_prompt) {
            llmMessages.push({ role: 'system', content: system_prompt });
        }
        llmMessages.push({ role: 'user', content: query });

        let response;
        if (modelData.queryType === 'client') {
            const openai_client = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
            response = await queryClient(openai_client, model, llmMessages);
        } else if (modelData.queryType === 'request') {
            response = await queryRequestChat(modelData.endpoint, model, system_prompt || '', query);
        } else {
            throw new LLMServiceError(`Invalid queryType: ${modelData.queryType}`);
        }

        return response;
    } catch (error) {
        if (error instanceof LLMServiceError) {
            throw error;
        }
        throw new LLMServiceError('Failed to query chat', error);
    }
}

async function queryChatImage({ url, model, system_prompt, query, image }) {
    try {
        // Parameter validation
        if (!url || !model || !query || !image) {
            const missingParams = [];
            if (!url) missingParams.push('url');
            if (!model) missingParams.push('model');
            if (!query) missingParams.push('query');
            if (!image) missingParams.push('image');
            throw new LLMServiceError(`Missing required parameters for queryChatImage: ${missingParams.join(', ')}`);
        }

        const messagesForApi = [];
        if (system_prompt && system_prompt.trim() !== '') {
            messagesForApi.push({ role: 'system', content: system_prompt });
        }

        messagesForApi.push({
            role: 'user',
            content: [
                { type: 'text', text: query },
                {
                    type: 'image_url',
                    image_url: {
                        url: image // Expects image to be a data URI (e.g., "data:image/jpeg;base64,...") or a public URL
                    }
                }
            ]
        });

        // Make the POST request
        const responseData = await postJson(url, {
            model,
            messages: messagesForApi,
            temperature: 0.7, // Consistent with queryRequestChat
            max_tokens: 1000, // Consistent with queryRequestChat
            // max_tokens could be a parameter if needed, e.g., max_tokens: 4096
        });

        // Validate response and extract content
        if (!responseData?.choices?.[0]?.message?.content) {
            throw new LLMServiceError('Invalid response format from vision API: Missing content.');
        }
        return responseData.choices[0].message.content;

    } catch (error) {
        if (error instanceof LLMServiceError) {
            throw error; // Re-throw if already our custom error
        }
        // Wrap other errors
        throw new LLMServiceError(`Failed to query vision API for model ${model}`, error);
    }
}

// ========================================
// Embedding Functions
// ========================================

async function queryRequestEmbedding(url, model, apiKey, query) {
    try {
        if (!url || !model || !query) {
            throw new LLMServiceError('Missing required parameters for queryRequestEmbedding');
        }
        const res = await postJson(url, { model, input: query }, apiKey);
        if (!res?.data?.[0]?.embedding) {
            throw new LLMServiceError('Invalid response format from embedding API');
        }
        return res.data[0].embedding;
    } catch (error) {
        throw new LLMServiceError('Failed to query embedding API', error);
    }
}

async function queryRequestEmbeddingTfidf(query, vectorizer, endpoint) {
    try {
        if (!query || !vectorizer || !endpoint) {
            throw new LLMServiceError('Missing required parameters for queryRequestEmbeddingTfidf');
        }
        const res = await postJson(endpoint, { query, vectorizer });
        if (!res?.query_embedding?.[0]) {
            throw new LLMServiceError('Invalid response format from TFIDF embedding API');
        }
        return res.query_embedding[0];
    } catch (error) {
        throw new LLMServiceError('Failed to query TFIDF embedding API', error);
    }
}

// ========================================
// Specialized Service Functions
// ========================================

async function queryRag(query, rag_db, user_id, model, num_docs, session_id) {
    try {
        if (!query || !rag_db || !user_id || !model) {
            const missingParams = [];
            if (!query) missingParams.push('query');
            if (!rag_db) missingParams.push('rag_db');
            if (!user_id) missingParams.push('user_id');
            if (!model) missingParams.push('model');
            throw new LLMServiceError(`Missing required parameters for queryRag: ${missingParams.join(', ')}`);
        }
        
        const res = await postJson('http://0.0.0.0:5000/rag', { 
            query, 
            rag_db, 
            user_id, 
            model, 
            num_docs, 
            session_id 
        });
        
        if (!res) {
            throw new LLMServiceError('Invalid response format from RAG API: No response received');
        }
        console.log('res', res);
        return res;
    } catch (error) {
        if (error instanceof LLMServiceError) {
            throw error;
        }
        throw new LLMServiceError('Failed to query RAG API', error);
    }
}

async function queryLambdaModel(input, rag_flag) {
    try {
        if (!input) {
            throw new LLMServiceError('Missing input parameter for queryLambdaModel');
        }
        const res = await postJson('http://lambda5.cels.anl.gov:8121/query', {
            text: input,
            rag_flag
        });
        if (!res?.answer) {
            throw new LLMServiceError('Invalid response format from Lambda model API');
        }
        return res.answer;
    } catch (error) {
        throw new LLMServiceError('Failed to query Lambda model', error);
    }
}

// ========================================
// Module Exports
// ========================================

module.exports = {
    postJson,

    // Error handling
    LLMServiceError,
    
    // Utility functions
    count_tokens,
    safe_count_tokens,
    
    // OpenAI client functions
    setupOpenaiClient,
    queryClient,
    
    // Chat API functions
    queryRequestChat,
    queryRequestChatArgo,
    queryChatOnly,
    queryChatImage,
    
    // Embedding functions
    queryRequestEmbedding,
    queryRequestEmbeddingTfidf,
    
    // Specialized service functions
    queryRag,
    queryLambdaModel
};

