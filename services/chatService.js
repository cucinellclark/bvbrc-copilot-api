// services/chatService.js

const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const {
  setupOpenaiClient,
  queryClient,
  queryRequestChat,
  queryRequestEmbedding,
  queryRequestEmbeddingTfidf,
  count_tokens,
  queryLambdaModel
} = require('./llmServices');
const { ChromaClient } = require('chromadb');

const MAX_TOKEN_HEADROOM = 500;

function getOpenaiClient(modelData) {
  return setupOpenaiClient(modelData.apiKey, modelData.endpoint);
}

async function queryModel(client, model, messages) {
  return await queryClient(client, model, messages);
}

async function queryRequest(endpoint, model, systemPrompt, query) {
  return await queryRequestChat(endpoint, model, systemPrompt, query);
}

async function handleChatRequest({ query, model, session_id, user_id, system_prompt }) {
  const db = await connectToDatabase();
  const modelData = await db.collection('modelList').findOne({ model });
  const chatCollection = db.collection('test1');
  const summaryCollection = db.collection('chatSummaries');

  if (!modelData) throw new Error(`Invalid model: ${model}`);

  const modelMaxTokens = modelData['max_tokens'] || 10000;
  const query_token_count = await count_tokens(query);

  // If the query is too long for the model, return an error
  if (query_token_count > modelMaxTokens - MAX_TOKEN_HEADROOM) {
    return { message: 'Query too long for selected model', error: 'TokenLimitExceeded' };
  }

  const chatSession = await chatCollection.findOne({ session_id });

  const userMessage = {
    message_id: uuidv4(),
    role: 'user',
    content: query,
    timestamp: new Date(),
    token_count: query_token_count
  };

  let sessionMessages = [];
  if (chatSession?.messages?.length) {
    // Load messages in reverse (most recent first)
    let total_tokens = query_token_count;
    const retainedMessages = [];
    for (let i = chatSession.messages.length - 1; i >= 0; i--) {
      const msg = chatSession.messages[i];
      total_tokens += msg.token_count;
      if (total_tokens < modelMaxTokens - MAX_TOKEN_HEADROOM) {
        retainedMessages.unshift(msg);
      } else {
        break;
      }
    }

    // Get dropped messages up to token limit, starting with most recent
    const droppedMessages = chatSession.messages.slice(0, chatSession.messages.length - retainedMessages.length);
    if (droppedMessages.length > 0) {
      let summaryTokens = 0;
      const summaryMessages = [];
      
      // Process messages from most recent to oldest until we hit token limit
      for (let i = droppedMessages.length - 1; i >= 0; i--) {
        const msg = droppedMessages[i];
        summaryTokens += msg.token_count;
        if (summaryTokens < modelMaxTokens - MAX_TOKEN_HEADROOM) {
          summaryMessages.unshift(msg);
        } else {
          break;
        }
      }

      if (summaryMessages.length > 0) {
        const dropText = summaryMessages.map(m => `${m.role}: ${m.content}`).join('\n');
        const summaryPrompt = `Summarize the following conversation briefly:\n\n${dropText}`;
        
        let summaryText;
        if (modelData.queryType === 'client') {
          const summaryModel = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
          summaryText = await queryClient(summaryModel, model, [{ role: 'user', content: summaryPrompt }]);
        } else if (modelData.queryType === 'request') {
          summaryText = await queryRequestChat(modelData.endpoint, model, '', summaryPrompt);
        } else {
          throw new Error(`Invalid queryType: ${modelData.queryType}`);
        }

        await summaryCollection.updateOne(
          { session_id },
          { $set: { summary: summaryText, updated_at: new Date() } },
          { upsert: true }
        );
      }
    }

    sessionMessages = retainedMessages;
  }

  const fullPrompt = sessionMessages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt_query = `Previous conversation:\n${fullPrompt}\n\nNew query:\n${query}\n\n`;

  const prompt_token_count = await count_tokens(prompt_query);

  const llmMessages = [];
  let systemMessage = null;
  let system_token_count = 0;
  if (system_prompt) {
    system_token_count = await count_tokens(system_prompt);
    llmMessages.push({ role: 'system', content: system_prompt });
    systemMessage = {
      message_id: uuidv4(),
      role: 'system',
      content: system_prompt,
      timestamp: new Date(),
      token_count: system_token_count
    };
  }
  llmMessages.push({ role: 'user', content: prompt_query });

  const total_token_estimate = prompt_token_count + system_token_count;
  if (total_token_estimate > modelMaxTokens) {
    return { message: 'Total prompt too long for model', error: 'SessionTokenLimitExceeded' };
  }

  let response;
  if (modelData.queryType === 'client') {
    const openai_client = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
    response = await queryClient(openai_client, model, llmMessages);
  } else if (modelData.queryType === 'request') {
    response = await queryRequestChat(modelData.endpoint, model, system_prompt || '', prompt_query);
  } else {
    throw new Error(`Invalid queryType: ${modelData.queryType}`);
  }

  const response_token_count = await count_tokens(response);
  const assistantMessage = {
    message_id: uuidv4(),
    role: 'assistant',
    content: response,
    timestamp: new Date(),
    token_count: response_token_count
  };

  if (!chatSession) {
    await chatCollection.insertOne({
      session_id,
      user_id,
      title: 'Untitled',
      created_at: new Date(),
      messages: []
    });
  }

  const messagesToInsert = systemMessage
    ? [userMessage, systemMessage, assistantMessage]
    : [userMessage, assistantMessage];

  await chatCollection.updateOne(
    { session_id },
    { $push: { messages: { $each: messagesToInsert } } }
  );

  return { message: 'success', response };
}

async function handleRagRequest({ query, rag_db, num_docs }) {
  const db = await connectToDatabase();
  const ragData = await db.collection('ragList').findOne({ name: rag_db });

  const {
    model_endpoint,
    apiKey,
    queryType,
    model: embeddingModelName,
    db_endpoint
  } = ragData;

  let query_embeddings;
  if (queryType === 'request') {
    if (embeddingModelName === 'tfidf') {
      query_embeddings = await queryRequestEmbeddingTfidf(query, rag_db, model_endpoint);
    } else {
      query_embeddings = await queryRequestEmbedding(model_endpoint, embeddingModelName, apiKey, query);
    }
  } else {
    throw new Error(`Invalid queryType: ${queryType}`);
  }

  const chroma = new ChromaClient({ path: db_endpoint });
  const collection = await chroma.getCollection({ name: rag_db });
  const results = await collection.query({ queryEmbeddings: [query_embeddings], nResults: num_docs });

  return { message: 'success', documents: results['documents'] };
}

async function handleLambdaDemo(text, rag_flag) {
  const response = await queryLambdaModel(text, rag_flag);
  return response;
}

module.exports = {
  handleChatRequest,
  handleRagRequest,
  handleLambdaDemo,
  getOpenaiClient,
  queryModel,
  queryRequest
};

