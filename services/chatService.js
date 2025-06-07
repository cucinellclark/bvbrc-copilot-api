// services/chatService.js

const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const {
  setupOpenaiClient,
  queryClient,
  queryRequestChat,
  queryRequestEmbedding,
  queryRequestEmbeddingTfidf,
  safe_count_tokens,
  queryLambdaModel,
  queryChatOnly,
  queryChatImage,
  queryRag,
  postJson,
  LLMServiceError
} = require('./llmServices');
const {
  getModelData,
  getRagData,
  getChatSession,
  createChatSession,
  addMessagesToSession,
  getOrCreateChatSession,
  saveSummary
} = require('./dbUtils');
const { ChromaClient } = require('chromadb');
const fs = require('fs');

const MAX_TOKEN_HEADROOM = 500;

// Helper function to create message objects with consistent structure
function createMessage(role, content, tokenCount) {
  return {
    message_id: uuidv4(),
    role,
    content,
    timestamp: new Date()
  };
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

async function handleChatRequest({ query, model, session_id, user_id, system_prompt, save_chat = true, include_history = true }) {
  try {
    const modelData = await getModelData(model);
    const max_tokens = modelData['max_tokens'] || 10000;
    const chatSession = await getChatSession(session_id);

    const llmMessages = []; // used for queryClient
    const userMessage = createMessage('user', query);

    // Creates a system message recorded in the conversation history if system_prompt is provided
    let systemMessage = null;
    if (system_prompt) {
      llmMessages.push({ role: 'system', content: system_prompt });
      systemMessage = createMessage('system', system_prompt);
    }

    // Get the conversation history from the database
    const chatSessionMessages = chatSession?.messages || [];
    var messages_list = [];
    if (chatSessionMessages.length > 0) {
      messages_list = chatSessionMessages.concat(messages_list);
    }
    
    llmMessages.push({ role: 'user', content: query });

    let prompt_query;
    if (include_history) {
      prompt_query = await createQueryFromMessages(query, messages_list, system_prompt || '', max_tokens);
    } else {
      prompt_query = query;
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

    const assistantMessage = createMessage('assistant', response);

    // Use database utility functions for session management
    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);
    }

    return { message: 'success', response };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle chat request', error);
  }
}

async function handleRagRequest({ query, rag_db, user_id, model, num_docs, session_id, save_chat = true, include_history = false }) {
  try {
    const modelData = await getModelData(model);
    const chatSession = await getChatSession(session_id);

    const userMessage = createMessage('user', query, 1);

    var { response, system_prompt } = await queryRag(query, rag_db, user_id, model, num_docs, session_id);

    if (include_history) {
      // Get the conversation history from the database
      const chatSessionMessages = chatSession?.messages || [];
      var messages_list = [];
      if (chatSessionMessages.length > 0) {
        messages_list = chatSessionMessages.concat(messages_list);
      }
      var tmp_prompt = 'RAG retrieval results:\n' + system_prompt;
      tmp_prompt = tmp_prompt + '\n\n Generated Response:\n' + response;
      system_prompt = tmp_prompt;
      const prompt_query = await createQueryFromMessages(query, messages_list, system_prompt, modelData['max_tokens'] || 10000);
      response = await handleChatQuery({ query: prompt_query, model, system_prompt: system_prompt || '' });
    } 

    // Create system message if system_prompt is provided
    let systemMessage = null;
    if (system_prompt) {
      systemMessage = createMessage('system', system_prompt);
    }

    const assistantMessage = createMessage('assistant', response, 1);

    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Add system message to the messages array if it exists
    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);
    }

    return { message: 'success', 'response': response, 'system_prompt': system_prompt };
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to handle RAG request', error);
  }
}

async function handleChatImageRequest({ query, model, session_id, user_id, image, system_prompt, save_chat = true, include_history = false }) {
  try {
    const modelData = await getModelData(model);

    const chatSession = await getChatSession(session_id);

    const userMessage = createMessage('user', query);

    let systemMessage = null;
    if (system_prompt && system_prompt.trim() !== '') {
      systemMessage = createMessage('system', system_prompt);
    }
    if (!system_prompt) {
      system_prompt = "";
    }

    let response;
    try {
      response = await queryChatImage({
        url: modelData.endpoint,
        model,
        query: query,
        image: image,
        system_prompt: system_prompt
      });
    } catch (error) {
      if (error instanceof LLMServiceError) {
        throw error;
      }
      throw new LLMServiceError('Failed to get model response for image chat', error);
    }

    if (include_history) {
      // Get the conversation history from the database
      const chatSessionMessages = chatSession?.messages || [];
      var messages_list = [];
      if (chatSessionMessages.length > 0) {
        messages_list = chatSessionMessages.concat(messages_list);
      }
      var tmp_prompt = 'Image analysis results:\n' + (response || '');
      tmp_prompt = "Original system prompt:\n" + system_prompt + "\n\n" + tmp_prompt;
      system_prompt = tmp_prompt;
      const prompt_query = await createQueryFromMessages(query, messages_list, system_prompt, modelData['max_tokens'] || 10000);
      response = await handleChatQuery({ query: prompt_query, model, system_prompt: system_prompt || '' });
    }

    // Create system message if system_prompt is provided
    if (system_prompt) {
      systemMessage = createMessage('system', system_prompt);
    }

    const assistantMessage = createMessage('assistant', response);

    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Add system message to the messages array if it exists
    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);
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
    const modelData = await getModelData(model);
    return await queryChatOnly({ query, model, system_prompt, modelData });
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to query chat', error);
  }
}

function createQueryFromMessages(query, messages, system_prompt, max_tokens) {
  return new Promise(async (resolve, reject) => {
    try {
      const data = await postJson('http://0.0.0.0:5000/get_prompt_query', {
        query: query || '',
        messages: messages || [],
        system_prompt: system_prompt || '',
        max_tokens: max_tokens || 10000
      });

      resolve(data.prompt_query);
    } catch (error) {
      console.error('Error in createQueryFromMessages:', error);
      
      // Fallback: format messages according to their roles
      let formattedMessages = [];
      
      // Add system prompt if provided
      if (system_prompt && system_prompt.trim() !== '') {
        formattedMessages.push(`System: ${system_prompt}`);
      }
      
      // Format existing messages according to their roles
      if (messages && messages.length > 0) {
        messages.forEach(msg => {
          if (msg.role && msg.content) {
            const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
            formattedMessages.push(`${roleLabel}: ${msg.content}`);
          }
        });
      }
      
      // Add the current query as the final message
      if (query && query.trim() !== '') {
        formattedMessages.push(`Current User Query: ${query}`);
      }
      
      const fallbackResponse = formattedMessages.join('\n\n');
      resolve(fallbackResponse);
    }
  });
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

