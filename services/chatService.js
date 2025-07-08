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
  saveSummary
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

async function runModel(ctx, modelData) {
  if (ctx.image) {
    return await queryChatImage({
      url: modelData.endpoint,
      model: ctx.model,
      query: ctx.prompt,
      image: ctx.image,
      system_prompt: ctx.systemPrompt
    });
  }
  if (modelData.queryType === 'client') {
    const client = setupOpenaiClient(modelData.apiKey, modelData.endpoint);
    return await queryClient(client, ctx.model, [
      { role: 'system', content: ctx.systemPrompt },
      { role: 'user', content: ctx.prompt }
    ]);
  }
  if (modelData.queryType === 'request') {
    return await queryRequestChat(
      modelData.endpoint,
      ctx.model,
      ctx.systemPrompt,
      ctx.prompt
    );
  }
  throw new LLMServiceError(`Invalid queryType: ${modelData.queryType}`);
}

async function handleCopilotRequest(opts) {
  try {
    // Destructure and set defaults from incoming options
    const {
      query = '',
      model,
      session_id,
      user_id,
      system_prompt = '',
      save_chat = true,
      include_history = true,
      rag_db = null,
      num_docs,
      image = null,
      enhanced_prompt = null,
      ...rest // capture any additional, future fields without breaking
    } = opts;

    // ------------------------------------------------------------------
    // (1) Determine whether to enhance the query / route to help-desk RAG
    // ------------------------------------------------------------------

    // Retrieve model configuration (API key, endpoint, etc.)
    const modelData = await getModelData(model);

    // Get conversation history first so it can be used in screenshot assessment
    const chatSession = await getChatSession(session_id);
    const history = chatSession?.messages || [];

    /*
    // Format conversation history for the prompt using createQueryFromMessages
    const formattedHistory = history.length > 0 
      ? await createQueryFromMessages('', history, '', 10000)
      : 'No previous conversation history';

    // Check if the query is a screenshot
    const screenshotAssessmentPrompt =
      'You are an assistant that outputs JSON only. Do not write any explanatory text or natural language.\n' +
      'Given the following conversation history and the current user query, determine if the query requires visual context (screenshot of the viewport) to be properly answered.\n' +
      'Conditions to set "query_screenshot" to true:\n' +
      '  - Explicitly references current viewport, layout, design, or visible UI elements.\n' +
      '  - Is vague and context-dependent (e.g., "What is this?", "Explain what I\'m seeing", "Describe this layout").\n' +
      '  - Indicates visual components like UI errors, layout issues, or unexpected screen behavior.\n' +
      'Otherwise, set "query_screenshot" to false.\n\n' +
      'Conversation history:\n' +
      `${formattedHistory}\n\n` +
      'User query:\n' +
      `${query}\n\n` +
      'Return ONLY a JSON object in this exact format:\n' +
      '{\n' +
      '  "query_screenshot": <true or false>\n' +
      '}';

    const screenshotAssessmentResponse = await queryChatOnly({
      query: query,
      model,
      system_prompt: screenshotAssessmentPrompt,
      include_history: false,
      modelData
    });

    console.log('***** screenshotAssessmentResponse *****\n', screenshotAssessmentResponse);

    */

    // System prompt instructing the model to return structured JSON
    const defaultInstructionPrompt = 
    'You are an assistant that only outputs JSON. Do not write any explanatory text or natural language.\n' +
    'Your tasks are:\n' +
    '1. Store the original user query in the "query" field.\n' +
    '2. Rewrite the query as "enhancedQuery" by intelligently incorporating any *relevant* context provided, while preserving the original intent.\n' +
    '   - If the original query is vague (e.g., "describe this page") and appears to reference a page, tool, feature, or system, rewrite it to make the help-related intent clear.\n' +
    '   - If there is no relevant context or no need to enhance, copy the original query into "enhancedQuery".\n' +
    '3. Set "rag_helpdesk" to true if the query relates to helpdesk-style topics such as:\n' +
    '   - website functionality\n' +
    '   - troubleshooting\n' +
    '   - how-to questions\n' +
    '   - user issues or technical support needs\n' +
    '   - vague references to a page, tool, or feature that may require explanation or support\n' +
    '   - **any question mentioning the BV-BRC (Bacterial and Viral Bioinformatics Resource Center) or its functionality**\n\n';

    const contextAndFormatInstructions = 
    '\n\nAdditional context for the page the user is on, as well as relevant data, is provided below. Use it only if it helps clarify or improve the query:\n' +
    `${system_prompt}\n\n` +
    'Return ONLY a JSON object in the following format:\n' +
    '{\n' +
    '  "query": "<original user query>",\n' +
    '  "enhancedQuery": "<rewritten or same query>",\n' +
    '  "rag_helpdesk": <true or false>\n' +
    '}';

    console.log('***** enhanced_prompt *****\n', enhanced_prompt);

    const instructionSystemPrompt = (enhanced_prompt || defaultInstructionPrompt) + contextAndFormatInstructions;
  

    // Call the LLM (image-aware if image is present)
    let instructionResponse;
    if (image) {
      instructionResponse = await queryChatImage({
        url: modelData.endpoint,
        model,
        query,
        image,
        system_prompt: instructionSystemPrompt
      });
    } else {
      instructionResponse = await queryChatOnly({
        query,
        model,
        system_prompt: instructionSystemPrompt,
        modelData
      });
    }

    // Utility for safely parsing possibly-wrapped JSON
    const safeParseJson = (text) => {
      if (!text || typeof text !== 'string') return null;
      // Remove markdown fences if the model wrapped the JSON
      const cleaned = text
        .replace(/```json[\s\S]*?```/gi, (m) => m.replace(/```json|```/gi, ''))
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
        .trim();

      try {
        return JSON.parse(cleaned);
      } catch (_) {
        // Fallback: extract first {...} block
        const first = cleaned.indexOf('{');
        const last  = cleaned.lastIndexOf('}');
        if (first !== -1 && last !== -1) {
          try { return JSON.parse(cleaned.slice(first, last + 1)); } catch (_) { return null; }
        }
      }
      return null;
    };

    const parsed = safeParseJson(instructionResponse) || {
      query,
      enhancedQuery: query,
      rag_helpdesk: false
    };
    console.log('***** parsed *****\n', parsed);

    const finalQuery      = parsed.enhancedQuery || query;
    const useHelpdeskRag  = !!parsed.rag_helpdesk;
    const activeRagDb     = useHelpdeskRag ? 'bvbrc_helpdesk' : null;

    // ------------------------------------------------------------------
    // (2) Build context: history, RAG retrieval, embeddings, etc.
    // ------------------------------------------------------------------

    // chatSession and history are already retrieved above for screenshot assessment

    // Retrieve documents (if RAG)
    let ragDocs = null;
    if (activeRagDb) {
      var { documents = ['No documents found'] } = await queryRag(
        finalQuery,
        activeRagDb,
        user_id,
        model,
        num_docs,
        session_id
      );
      ragDocs = documents;
    }

    if (rag_db && rag_db !== 'bvbrc_helpdesk') {
      var { documents = ['No documents found'] } = await queryRag(
        finalQuery,
        rag_db,
        user_id,
        model,
        num_docs,
        session_id
      );

      if (ragDocs && ragDocs.length > 0) {
        ragDocs = ragDocs.concat(documents);
      } else {
        ragDocs = documents;
      }
    }

    // ------------------------------------------------------------------
    // (3) Construct the prompt (history + RAG documents)
    // ------------------------------------------------------------------

    const max_tokens = 40000;
    let promptWithHistory = finalQuery;
    if (include_history && history.length > 0) {
      promptWithHistory = await createQueryFromMessages(
        finalQuery,
        history,
        system_prompt,
        max_tokens
      );
    }

    if (ragDocs) {
      if (include_history && history.length > 0) {
        promptWithHistory = `${promptWithHistory}\n\nRAG retrieval results:\n${ragDocs.join('\n\n')}`;
      } else {
        promptWithHistory = `Current User Query: ${finalQuery}\n\nRAG retrieval results:\n${ragDocs.join('\n\n')}`;
      }
    }

    // Update context object for runModel convenience
    const ctx = {
      prompt: promptWithHistory,
      systemPrompt: system_prompt,
      model,
      image,
      ragDocs
    };

    // ------------------------------------------------------------------
    // (4) Obtain model response
    // ------------------------------------------------------------------

    const response = await runModel(ctx, modelData);

    // ------------------------------------------------------------------
    // (5) Persist conversation + embeddings
    // ------------------------------------------------------------------

    // Create message objects
    const userContentForHistory = `Enhanced User Query: ${finalQuery}\n\nInstruction System Prompt: ${instructionSystemPrompt}`;

    const userMessage       = createMessage('user', query);
    const assistantMessage  = createMessage('assistant', response);

    let systemMessage = null;
    console.log('***** system_prompt *****\n', system_prompt);
    if (system_prompt && system_prompt.trim() !== '') {
      systemMessage = createMessage('system', system_prompt);
      if (ragDocs) systemMessage.documents = ragDocs;
      if (userContentForHistory) systemMessage.copilotDetails = userContentForHistory;
    }

    // Ensure chat session exists if we intend to save
    if (!chatSession && save_chat) {
      await createChatSession(session_id, user_id);
    }

    // Store messages
    if (save_chat) {
      const toInsert = systemMessage
        ? [userMessage, systemMessage, assistantMessage]
        : [userMessage, assistantMessage];

      await addMessagesToSession(session_id, toInsert);
    }

    console.log('returning response in enhanced copilot');
    console.log('***** systemMessage *****\n', systemMessage);

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
    throw new LLMServiceError('Failed to handle copilot request', error);
  }
}

async function handleChatRequest({ query, model, session_id, user_id, system_prompt, save_chat = true, include_history = true }) {
  try {
    const modelData = await getModelData(model);
    const max_tokens = 40000;
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
        max_tokens: 40000
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

// ========================================
// Query Enhancement Helper
// ========================================

/**
 * Enhance a user query by injecting relevant context from the system prompt or image.
 * The function uses an LLM to rewrite the query so that downstream models receive
 * a richer prompt while keeping the original intent intact. The LLM is instructed
 * to return ONLY the rewritten query text with no additional commentary.
 *
 * @param {string} originalQuery  - The user\'s original query.
 * @param {string} systemPrompt   - Additional textual context provided to the assistant.
 * @param {string|null} image     - Optional image (data-URI or public URL) supplied by the user.
 * @param {string} model          - The name of the model that will perform the rewrite.
 * @returns {Promise<string>} The enhanced query text.
 */
async function enhanceQuery(originalQuery, systemPrompt = '', image = null, model = null) {
  try {
    // If there is no extra context, return the query unchanged.
    if ((!systemPrompt || systemPrompt.trim() === '') && !image) {
      return originalQuery;
    }
    if (!model) {
      return originalQuery;
    }

    // Attempt to fetch model metadata; fall back gracefully if the model is unknown.
    let modelData;
    try {
      modelData = await getModelData(model);
    } catch (err) {
      console.warn(`[enhanceQuery] Unable to find model data for ${model}. Returning original query.`);
      return originalQuery;
    }

    // Instruction telling the model exactly how to behave.
    const enhancementInstruction =
      'You are an assistant that rewrites the user\'s query by augmenting it with any RELEVANT context provided.' +
      ' The rewritten query must preserve the original intent while adding helpful detail.' +
      ' If the additional context is not relevant, keep the query unchanged.' +
      ' Respond ONLY with the rewritten query and nothing else.';

    // Build the user content that will be passed to the enhancement model.
    const userContent = image
      ? `Original user query:\n${originalQuery}` // For images the visual context is supplied separately.
      : `Original user query:\n${originalQuery}\n\nSystem prompt context:\n${systemPrompt}`;

    let rewrittenQuery;
    console.log('image', image);
    if (image) {
      // Use the image-capable chat endpoint when an image is present.
      rewrittenQuery = await queryChatImage({
        url: modelData.endpoint,
        model,
        query: userContent,
        image,
        system_prompt: enhancementInstruction + (systemPrompt ? `\n\nTextual context you may use if relevant:\n${systemPrompt}` : '')
      });
    } else {
      // Text-only path.
      rewrittenQuery = await queryChatOnly({
        query: userContent,
        model,
        system_prompt: enhancementInstruction,
        modelData
      });
    }

    return typeof rewrittenQuery === 'string' ? rewrittenQuery.trim() : originalQuery;
  } catch (error) {
    console.error('[enhanceQuery] Failed to enhance query:', error);
    // On failure, gracefully return the original query to avoid blocking the user.
    return originalQuery;
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

