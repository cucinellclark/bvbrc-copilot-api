// services/chatService.js

const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const {
  setupOpenaiClient,
  queryClient,
  queryRequestChat,
  queryRequestEmbedding,
  queryRequestEmbeddingTfidf,
  queryCorpusSearch,
  safe_count_tokens,
  queryLambdaModel,
  queryChatOnly,
  queryChatImage,
  LLMServiceError
} = require('./llmServices');
const { ChromaClient } = require('chromadb');
const fs = require('fs');

const MAX_TOKEN_HEADROOM = 500;

// New helper function to manage context and summarization
async function manageContextAndSummarize({
  chatSessionMessages, // existing messages from chatSession.messages
  currentQueryTokenCount,
  modelMaxTokens,
  maxTokenHeadroom, // typically MAX_TOKEN_HEADROOM
  model, // current model being used, for summarization if specific summary model not defined
  modelData, // for summary_model, endpoint, apiKey for summarization
  sessionId, // for saving summary
  summaryCollection, // db collection for summaries
  saveChat // boolean, to decide if summary should be saved
}) {
  let retainedMessages = [];
  let summaryTextFromDropped = null;

  if (chatSessionMessages?.length) {
    let totalContextTokens = currentQueryTokenCount;
    const tempRetainedMessages = [];

    for (let i = chatSessionMessages.length - 1; i >= 0; i--) {
      const msg = chatSessionMessages[i];
      if (msg.token_count === undefined || msg.token_count === null) {
        // console.warn(`Message ${msg.message_id} in history is missing token_count. Skipping.`);
        continue; // Or assign a default, e.g., 10 tokens
      }
      totalContextTokens += msg.token_count;
      if (totalContextTokens < modelMaxTokens - maxTokenHeadroom) {
        tempRetainedMessages.unshift(msg);
      } else {
        // This message and older ones are dropped
        const droppedMessages = chatSessionMessages.slice(0, i + 1);
        
        if (droppedMessages.length > 0) {
          let summaryTokens = 0;
          const summaryMessagesContent = [];
          for (let j = droppedMessages.length - 1; j >= 0; j--) {
            const dropMsg = droppedMessages[j];
            if (dropMsg.token_count === undefined || dropMsg.token_count === null) continue;

            summaryTokens += dropMsg.token_count;
            // Ensure summary prompt itself doesn't get too big
            const summaryModelMaxTokens = modelData.summary_model_max_tokens || modelMaxTokens;
            if (summaryTokens < summaryModelMaxTokens - maxTokenHeadroom - 50) { // 50 for summary prompt text
              summaryMessagesContent.unshift(dropMsg);
            } else {
              break;
            }
          }

          if (summaryMessagesContent.length > 0) {
            const dropText = summaryMessagesContent.map(m => `${m.role}: ${m.content}`).join('\\n');
            const summarySystemPrompt = 'Summarize the following conversation very briefly:';
            const summaryUserQuery = dropText;
            
            try {
              summaryTextFromDropped = await queryChatOnly({
                query: summaryUserQuery,
                model: modelData.summary_model || model,
                system_prompt: summarySystemPrompt,
                modelData
              });

              if (saveChat && summaryTextFromDropped) {
                await summaryCollection.updateOne(
                  { session_id: sessionId },
                  { $set: { summary: summaryTextFromDropped, updated_at: new Date() } },
                  { upsert: true }
                );
              }
            } catch (error) {
              console.error(`Failed to generate summary for session ${sessionId}:`, error);
              // Non-fatal, continue without summary for dropped parts
            }
          }
        }
        break; // Stop adding historical messages
      }
    }
    retainedMessages = tempRetainedMessages;
  }
  return { retainedMessages, summaryTextFromDropped };
}

function getOpenaiClient(modelData) {
  try {
    return setupOpenaiClient(modelData.apiKey, modelData.endpoint);
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to setup OpenAI client', error);
  }
}

async function queryModel(client, model, messages) {
  try {
    return await queryClient(client, model, messages);
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to query model', error);
  }
}

async function queryRequest(endpoint, model, systemPrompt, query) {
  try {
    return await queryRequestChat(endpoint, model, systemPrompt, query);
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to query request', error);
  }
}

async function handleChatRequest({ query, model, session_id, user_id, system_prompt, save_chat = true }) {
  try {
    const db = await connectToDatabase();
    const modelData = await db.collection('modelList').findOne({ model });
    const chatCollection = db.collection('test1');
    const summaryCollection = db.collection('chatSummaries');

    if (!modelData) {
      throw new LLMServiceError(`Invalid model: ${model}`);
    }

    const modelMaxTokens = modelData['max_tokens'] || 10000;
    const query_token_count = await safe_count_tokens(query);

    if (query_token_count > modelMaxTokens - MAX_TOKEN_HEADROOM) {
      throw new LLMServiceError('Query too long for selected model');
    }

    const chatSession = await chatCollection.findOne({ session_id });

    const userMessage = {
      message_id: uuidv4(),
      role: 'user',
      content: query,
      timestamp: new Date(),
      token_count: query_token_count
    };

    // Use the new helper function
    const { retainedMessages, summaryTextFromDropped } = await manageContextAndSummarize({
      chatSessionMessages: chatSession?.messages,
      currentQueryTokenCount: query_token_count,
      modelMaxTokens,
      maxTokenHeadroom: MAX_TOKEN_HEADROOM,
      model,
      modelData,
      sessionId: session_id,
      summaryCollection,
      saveChat: save_chat
    });

    const fullPromptParts = [];
    if (summaryTextFromDropped) {
        fullPromptParts.push(`Summary of earlier conversation: ${summaryTextFromDropped}`);
    }
    if (retainedMessages.length > 0) {
        const historyText = retainedMessages.map(m => `${m.role}: ${m.content}`).join('\\n');
        fullPromptParts.push(`Previous conversation:\n${historyText}`);
    }
    fullPromptParts.push(`New query:\n${query}`);
    const prompt_query = fullPromptParts.join('\\n\\n');

    const prompt_token_count = await safe_count_tokens(prompt_query);

    const llmMessages = [];
    let systemMessage = null;
    let system_token_count = 0;
    if (system_prompt) {
      system_token_count = await safe_count_tokens(system_prompt);
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
      throw new LLMServiceError('Total prompt too long for model');
    }

    let response;
    try {
      if (modelData.queryType === 'client') {
        const openai_client = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
        response = await queryClient(openai_client, model, llmMessages);
      } else if (modelData.queryType === 'request') {
        response = await queryRequestChat(modelData.endpoint, model, system_prompt || '', prompt_query);
      } else {
        throw new LLMServiceError(`Invalid queryType: ${modelData.queryType}`);
      }
    } catch (error) {
      if (error instanceof LLMServiceError) {
        throw error;
      }
      throw new LLMServiceError('Failed to get model response', error);
    }

    const response_token_count = await safe_count_tokens(response);
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

    if (save_chat) {
      await chatCollection.updateOne(
        { session_id },
        { $push: { messages: { $each: messagesToInsert } } }
      );
    }

    return { message: 'success', response };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle chat request', error);
  }
}

async function handleRagRequest({ query, rag_db, num_docs }) {
  try {
    const db = await connectToDatabase();
    const ragData = await db.collection('ragList').findOne({ name: rag_db });

    if (!ragData) {
      throw new LLMServiceError(`Invalid RAG database: ${rag_db}`);
    }

    const {
      name,
      rag_endpoint,
      apiKey,
      queryType,
      model: embeddingModelName
    } = ragData;

    // Hardcoded parameters
    const strategies = null;  // Default to semantic search
    const fusion = 'rrf';  // Default fusion method
    const required_tags = [];  // No required tags by default
    const excluded_tags = [];  // No excluded tags by default

    const results = await queryCorpusSearch(
      query,
      rag_endpoint,
      name,
      strategies,
      num_docs,
      fusion,
      required_tags,
      excluded_tags
    );

    return { message: 'success', documents: results };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle RAG request', error);
  }
}

async function handleRagRequestChroma({ query, rag_db, num_docs }) {
  try {
    const db = await connectToDatabase();
    const ragData = await db.collection('ragList').findOne({ name: rag_db });

    if (!ragData) {
      throw new LLMServiceError(`Invalid RAG database: ${rag_db}`);
    }

    const {
      model_endpoint,
      apiKey,
      queryType,
      model: embeddingModelName,
      db_endpoint
    } = ragData;

    let query_embeddings;
    try {
      if (queryType === 'request') {
        if (embeddingModelName === 'tfidf') {
          query_embeddings = await queryRequestEmbeddingTfidf(query, rag_db, model_endpoint);
        } else {
          query_embeddings = await queryRequestEmbedding(model_endpoint, embeddingModelName, apiKey, query);
        }
      } else {
        throw new LLMServiceError(`Invalid queryType: ${queryType}`);
      }
    } catch (error) {
      if (error instanceof LLMServiceError) {
        throw error;
      }
      throw new LLMServiceError('Failed to get query embeddings', error);
    }

    const chroma = new ChromaClient({ path: db_endpoint });
    const collection = await chroma.getCollection({ name: rag_db });
    const results = await collection.query({ queryEmbeddings: [query_embeddings], nResults: num_docs });

    return { message: 'success', documents: results['documents'] };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle Chroma RAG request', error);
  }
}

async function handleChatImageRequest({ query, model, session_id, user_id, image, system_prompt, save_chat = true }) {
  try {
    const db = await connectToDatabase();
    const modelData = await db.collection('modelList').findOne({ model });
    const chatCollection = db.collection('test1');
    const summaryCollection = db.collection('chatSummaries');

    if (!modelData) {
      throw new LLMServiceError(`Invalid model: ${model}`);
    }

    const modelMaxTokens = modelData['max_tokens'] || 10000;
    const current_text_query_token_count = await safe_count_tokens(query);

    if (current_text_query_token_count > modelMaxTokens - MAX_TOKEN_HEADROOM) {
      throw new LLMServiceError('Query text too long for selected model');
    }

    const chatSession = await chatCollection.findOne({ session_id });

    const userMessage = { 
      message_id: uuidv4(),
      role: 'user',
      content: query, 
      timestamp: new Date(),
      token_count: current_text_query_token_count
    };

    // Use the new helper function
    const { retainedMessages, summaryTextFromDropped } = await manageContextAndSummarize({
      chatSessionMessages: chatSession?.messages,
      currentQueryTokenCount: current_text_query_token_count,
      modelMaxTokens,
      maxTokenHeadroom: MAX_TOKEN_HEADROOM,
      model,
      modelData,
      sessionId: session_id,
      summaryCollection,
      saveChat: save_chat
    });

    const effectiveSystemPromptParts = [];
    if (system_prompt && system_prompt.trim() !== '') {
      effectiveSystemPromptParts.push(system_prompt);
    }
    if (summaryTextFromDropped) {
      effectiveSystemPromptParts.push(`Summary of earlier conversation parts: ${summaryTextFromDropped}`);
    }
    if (retainedMessages.length > 0) {
      const historyText = retainedMessages.map(m => `${m.role}: ${m.content}`).join('\n');
      effectiveSystemPromptParts.push(`Previous conversation messages:\n${historyText}`);
    }
    const final_system_prompt_for_api = effectiveSystemPromptParts.join('\n\n');

    const final_system_prompt_token_count = await safe_count_tokens(final_system_prompt_for_api);

    const total_text_token_estimate = final_system_prompt_token_count + current_text_query_token_count;
    if (total_text_token_estimate > modelMaxTokens - MAX_TOKEN_HEADROOM) {
      throw new LLMServiceError('Combined text prompt (history + query) too long for model, even after potential summarization.');
    }
    
    let systemMessageData = null;
    if (system_prompt && system_prompt.trim() !== '') {
      const original_system_prompt_token_count = await safe_count_tokens(system_prompt);
      systemMessageData = {
        message_id: uuidv4(),
        role: 'system',
        content: system_prompt,
        timestamp: new Date(),
        token_count: original_system_prompt_token_count
      };
    }

    let response;
    try {
      response = await queryChatImage({
        url: modelData.endpoint,
        model,
        query: query,
        image: image,
        system_prompt: final_system_prompt_for_api
      });
    } catch (error) {
      if (error instanceof LLMServiceError) {
        throw error;
      }
      throw new LLMServiceError('Failed to get model response for image chat', error);
    }

    const response_token_count = await safe_count_tokens(response);

    const assistantMessage = {
      message_id: uuidv4(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      token_count: response_token_count
    };

    if (!chatSession && save_chat) {
      await chatCollection.insertOne({
        session_id,
        user_id,
        title: 'Untitled',
        created_at: new Date(),
        messages: []
      });
    }

    if (save_chat) {
        const messagesToInsert = [];
        messagesToInsert.push(userMessage);
        if (systemMessageData) {
          messagesToInsert.push(systemMessageData);
        }
        messagesToInsert.push(assistantMessage);

        await chatCollection.updateOne(
          { session_id },
          { $push: { messages: { $each: messagesToInsert } } }
        );
    }

    return { message: 'success', response };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    if (error.message.includes('Failed to get model response for image chat') || error.message.includes('Invalid model') || error.message.includes('Query text too long') || error.message.includes('Combined text prompt')) {
        throw error;
    }
    throw new LLMServiceError('Failed to handle chat image request', error);
  }
}

async function handleLambdaDemo(text, rag_flag) {
  try {
    const response = await queryLambdaModel(text, rag_flag);
    return response;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle Lambda demo request', error);
  }
}

async function handleChatQuery({ query, model, system_prompt = '' }) {
  try {
    const db = await connectToDatabase();
    const modelData = await db.collection('modelList').findOne({ model });

    if (!modelData) {
      throw new LLMServiceError(`Invalid model: ${model}`);
    }

    return await queryChatOnly({ query, model, system_prompt, modelData });
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to query chat', error);
  }
}

module.exports = {
  handleChatRequest,
  handleRagRequest,
  handleLambdaDemo,
  getOpenaiClient,
  queryModel,
  queryRequest,
  handleChatQuery,
  handleChatImageRequest
};

