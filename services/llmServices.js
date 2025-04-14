// services/llmServices.js

const { OpenAI } = require('openai');
const fetch = require('node-fetch');

function setupOpenaiClient(apiKey, baseURL) {
    return new OpenAI({ apiKey, baseURL });
}

async function queryClient(client, model, messages) {
    try {
        const res = await client.chat.completions.create({ model, messages });
        return res.choices[0].message.content;
    } catch (err) {
        console.error('OpenAI client error:', err);
        return null;
    }
}

async function queryRequestChat(url, model, system_prompt, query) {
    return model === 'gpt4o'
        ? await queryRequestChatArgo(url, model, system_prompt, query)
        : await postJson(url, {
            model, temperature: 1.0,
            messages: [{ role: 'system', content: system_prompt }, { role: 'user', content: query }]
        }).then(res => res?.choices?.[0]?.message?.content || '');
}

async function queryRequestChatArgo(url, model, system_prompt, query) {
    return postJson(url, {
        model,
        prompt: [query],
        system: system_prompt,
        user: "cucinell",
        temperature: 1.0
    }).then(res => res?.response || '');
}

async function queryRequestEmbedding(url, model, apiKey, query) {
    return postJson(url, { model, input: query }, apiKey)
        .then(res => res.data?.[0]?.embedding);
}

async function queryRequestEmbeddingTfidf(query, vectorizer, endpoint) {
    return postJson(endpoint, { query, vectorizer })
        .then(res => res.query_embedding?.[0]);
}

async function count_tokens(query) {
    const response = await postJson('http://0.0.0.0:5000/count_tokens', { query });
    return response?.token_count || 0;
}

async function queryLambdaModel(input, rag_flag) {
    const res = await postJson('http://lambda5.cels.anl.gov:8121/query', {
        text: input,
        rag_flag
    });
    return res?.answer || '';
}

async function postJson(url, data, apiKey = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`Fetch error: ${res.status} ${res.statusText}`);
    return await res.json();
}

module.exports = {
    setupOpenaiClient,
    queryClient,
    queryRequestChat,
    queryRequestChatArgo,
    queryRequestEmbedding,
    queryRequestEmbeddingTfidf,
    count_tokens,
    queryLambdaModel
};

