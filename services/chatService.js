// services/chatService.js

const { v4: uuidv4 } = require('uuid');
const { connectToDatabase } = require('../database');
const {
  setupOpenaiClient,
  queryClient,
  queryRequestChat,
  queryRequestEmbedding,
  queryRequestEmbeddingTfidf,
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
  saveSummary,
  storeMessageEmbedding
} = require('./dbUtils');
const { ChromaClient } = require('chromadb');
const fs = require('fs');

const MAX_TOKEN_HEADROOM = 500;

const config = require('../config.json');

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

async function handleCopilotRequest({ 
  query, 
  model, 
  session_id, 
  user_id, 
  system_prompt, 
  save_chat = true, 
  include_history = true,
  // RAG-specific parameters
  rag_db,
  num_docs,
  // Image-specific parameters
  image
}) {
  try {
    const modelData = await getModelData(model);
    const max_tokens = modelData['max_tokens'] || 10000;
    const chatSession = await getChatSession(session_id);
    const chatSessionMessages = chatSession?.messages || [];

    // Initialize common variables
    const embedding_url = config['embedding_url'];
    const embedding_model = config['embedding_model'];
    const embedding_apiKey = config['embedding_apiKey'];
    
    const userMessage = createMessage('user', query);
    let user_embedding;
    let documents = null;
    let response;
    let systemMessage = null;

    // Determine request type and handle accordingly
    const isRagRequest = rag_db !== null;
    const isImageRequest = image !== null;

    if (isRagRequest) {
      // RAG Request handling
      const ragResult = await queryRag(query, rag_db, user_id, model, num_docs, session_id);
      documents = ragResult.documents || ['No documents found'];
      user_embedding = ragResult.embedding;

      // Construct RAG prompt
      let prompt_query = 'RAG retrieval results:\n' + documents.join('\n\n');
      prompt_query = "Current User Query: " + query + "\n\n" + prompt_query;
      
      const rag_system_prompt = "You are a helpful AI assistant that can answer questions." + 
        "You are given a list of documents and a user query. " +
        "You need to answer the user query based on the documents if those documents are relevant to the user query. " +
        "If they are not relevant, you need to answer the user query based on your knowledge. ";

      response = await handleChatQuery({ 
        query: prompt_query, 
        model, 
        system_prompt: rag_system_prompt 
      });

      if (!response) {
        response = 'No response from model';
      }

      // Create system message with documents
      systemMessage = createMessage('system', rag_system_prompt);
      if (documents && documents.length > 0) {
        systemMessage.documents = documents;
      }

    } else if (isImageRequest) {
      // Image Request handling
      user_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, query);
      
      if (!system_prompt) {
        system_prompt = "";
      }

      response = await queryChatImage({
        url: modelData.endpoint,
        model,
        query: query,
        image: image,
        system_prompt: system_prompt
      });

      if (system_prompt && system_prompt.trim() !== '') {
        systemMessage = createMessage('system', system_prompt);
      }

    } else {
      // Regular Chat Request handling
      user_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, query);
      
      const llmMessages = [];
      
      // Handle system prompt
      if (system_prompt && system_prompt.trim() !== '') {
        llmMessages.push({ role: 'system', content: system_prompt });
        systemMessage = createMessage('system', system_prompt);
      }

      llmMessages.push({ role: 'user', content: query });

      let prompt_query;
      if (include_history) {
        prompt_query = await createQueryFromMessages(query, chatSessionMessages, system_prompt || '', max_tokens);
      } else {
        prompt_query = query;
      }

      if (!system_prompt || system_prompt.trim() === '') {
        system_prompt = 'You are a helpful assistant that can answer questions.';
      }

      // Query the model based on queryType
      if (modelData.queryType === 'client') {
        const openai_client = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
        response = await queryClient(openai_client, model, llmMessages);
      } else if (modelData.queryType === 'request') {
        response = await queryRequestChat(modelData.endpoint, model, system_prompt || '', prompt_query);
      } else {
        throw new LLMServiceError(`Invalid queryType: ${modelData.queryType}`);
      }
    }

    // Common post-processing for all request types
    const assistantMessage = createMessage('assistant', response);
    const assistant_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, response);

    // Create session if needed
    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Prepare messages to insert
    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    // Save to database if requested
    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);

      if (user_embedding) {
        await storeMessageEmbedding(session_id, userMessage.message_id, user_embedding);
      }
      if (assistant_embedding) {
        await storeMessageEmbedding(session_id, assistantMessage.message_id, assistant_embedding);
      }
    }

    return { 
      message: 'success', 
      userMessage,
      assistantMessage,
      ...(systemMessage && { systemMessage })
    };

  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    
    // Handle specific error cases for image requests
    if (image && (error.message.includes('Failed to get model response for image chat') || 
                  error.message.includes('Invalid model') || 
                  error.message.includes('Query text too long') || 
                  error.message.includes('Combined text prompt'))) {
      throw error;
    }
    
    const requestType = isRagRequest ? 'RAG' : (isImageRequest ? 'image chat' : 'chat');
    throw new LLMServiceError(`Failed to handle ${requestType} request`, error);
  }
}

async function handleChatRequest({ query, model, session_id, user_id, system_prompt, save_chat = true, include_history = true }) {
  try {
    const modelData = await getModelData(model);
    const max_tokens = modelData['max_tokens'] || 10000;
    const chatSession = await getChatSession(session_id);

    const llmMessages = []; // used for queryClient
    const userMessage = createMessage('user', query);
    //(url, model, apiKey, query)
    const embedding_url = config['embedding_url'];
    const embedding_model = config['embedding_model'];
    const embedding_apiKey = config['embedding_apiKey'];
    const user_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, query);

    // Creates a system message recorded in the conversation history if system_prompt is provided
    let systemMessage = null;
    if (system_prompt && system_prompt.trim() !== '') {
      llmMessages.push({ role: 'system', content: system_prompt });
      systemMessage = createMessage('system', system_prompt);
    }

    // Get the conversation history from the database
    const chatSessionMessages = chatSession?.messages || [];
    
    llmMessages.push({ role: 'user', content: query });

    let prompt_query;
    if (include_history) {
      prompt_query = await createQueryFromMessages(query, chatSessionMessages, system_prompt || '', max_tokens);
    } else {
      prompt_query = query;
    }

    if (!system_prompt || system_prompt.trim() === '') {
      system_prompt = 'You are a helpful assistant that can answer questions.';
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
    const assistant_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, response);

    // Use database utility functions for session management
    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);

      if (user_embedding) {
        await storeMessageEmbedding(session_id, userMessage.message_id, user_embedding);
      }
      if (assistant_embedding) {
        await storeMessageEmbedding(session_id, assistantMessage.message_id, assistant_embedding);
      }
    }

    return { 
      message: 'success', 
      userMessage,
      assistantMessage,
      ...(systemMessage && { systemMessage })
    };
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
    const chatSessionMessages = chatSession?.messages || [];

    const userMessage = createMessage('user', query, 1);

    const embedding_url = config['embedding_url'];
    const embedding_model = config['embedding_model'];
    const embedding_apiKey = config['embedding_apiKey'];

    // embedding created in distllm
    var { documents, embedding: user_embedding } = await queryRag(query, rag_db, user_id, model, num_docs, session_id);

    if (!documents || documents.length === 0) {
      documents = ['No documents found'];
    }

    var prompt_query = 'RAG retrieval results:\n' + documents.join('\n\n');
    prompt_query = "Current User Query: " + query + "\n\n" + prompt_query;
    var system_prompt = "You are a helpful AI assistant that can answer questions." + 
     "You are given a list of documents and a user query. " +
     "You need to answer the user query based on the documents if those documents are relevant to the user query. " +
     "If they are not relevant, you need to answer the user query based on your knowledge. ";

    response = await handleChatQuery({ query: prompt_query, model, system_prompt: system_prompt || '' });

    if (!response) {
      response = 'No response from model';
    }

    // Create system message if system_prompt is provided
    let systemMessage = null;
    if (system_prompt) {
      systemMessage = createMessage('system', system_prompt);
      if (documents && documents.length > 0) {
        systemMessage.documents = documents;
      }
    }

    const assistantMessage = createMessage('assistant', response, 1);
    const assistant_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, response);

    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Add system message to the messages array if it exists
    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);

      if (user_embedding) {
        await storeMessageEmbedding(session_id, userMessage.message_id, user_embedding);
      }
      if (assistant_embedding) {
        await storeMessageEmbedding(session_id, assistantMessage.message_id, assistant_embedding);
      }
    }

    return { 
      message: 'success', 
      userMessage,
      assistantMessage,
      ...(systemMessage && { systemMessage })
    };
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
    const embedding_url = config['embedding_url'];
    const embedding_model = config['embedding_model'];
    const embedding_apiKey = config['embedding_apiKey'];
    const user_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, query);

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

    // Create system message if system_prompt is provided
    if (system_prompt) {
      systemMessage = createMessage('system', system_prompt);
    }

    const assistantMessage = createMessage('assistant', response);
    const assistant_embedding = await queryRequestEmbedding(embedding_url, embedding_model, embedding_apiKey, response);
    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Add system message to the messages array if it exists
    const messagesToInsert = systemMessage
      ? [userMessage, systemMessage, assistantMessage]
      : [userMessage, assistantMessage];

    if (save_chat) {
      await addMessagesToSession(session_id, messagesToInsert);

      if (user_embedding) {
        await storeMessageEmbedding(session_id, userMessage.message_id, user_embedding);
      }
      if (assistant_embedding) {
        await storeMessageEmbedding(session_id, assistantMessage.message_id, assistant_embedding);
      }
    }

    return { 
      message: 'success', 
      userMessage,
      assistantMessage,
      ...(systemMessage && { systemMessage })
    };
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

async function getPathState(path) {
  try {
    const response = await postJson('http://0.0.0.0:5000/get_path_state', { path: path });
    return response;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to get path state', error);
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
  handleChatImageRequest,
  getPathState,
  handleCopilotRequest
};

