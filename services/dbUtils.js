const { connectToDatabase } = require('../database');
const { LLMServiceError } = require('./llmServices');

/**
 * Get model data from the database
 * @param {string} model - The model name to look up
 * @returns {Object} Model data object
 * @throws {LLMServiceError} If model is not found
 */
async function getModelData(model) {
  try {
    const db = await connectToDatabase();
    const modelData = await db.collection('modelList').findOne({ model });
    
    if (!modelData) {
      throw new LLMServiceError(`Invalid model: ${model}`);
    }
    
    return modelData;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to get model data', error);
  }
}

/**
 * Get all active models of a specific type
 * @param {string} modelType - The model type to filter by (e.g., 'chat')
 * @returns {Array} Array of active model objects
 */
async function getActiveModels(modelType = 'chat') {
  try {
    const db = await connectToDatabase();
    const modelCollection = db.collection('modelList');
    return await modelCollection.find({ active: true, model_type: modelType }).sort({ priority: 1 }).toArray();
  } catch (error) {
    throw new LLMServiceError('Failed to get active models', error);
  }
}

/**
 * Get all active RAG databases
 * @returns {Array} Array of active RAG database objects
 */
async function getActiveRagDatabases() {
  try {
    const db = await connectToDatabase();
    const ragCollection = db.collection('ragList');
    return await ragCollection.find({ active: true }).sort({ priority: 1 }).toArray();
  } catch (error) {
    throw new LLMServiceError('Failed to get active RAG databases', error);
  }
}

/**
 * Get RAG database configuration
 * @param {string} ragDbName - The RAG database name to look up
 * @returns {Object} RAG database configuration
 * @throws {LLMServiceError} If RAG database is not found
 */
async function getRagData(ragDbName) {
  try {
    const db = await connectToDatabase();
    const ragData = await db.collection('ragList').findOne({ name: ragDbName });
    
    if (!ragData) {
      throw new LLMServiceError(`Invalid RAG database: ${ragDbName}`);
    }
    
    return ragData;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    throw new LLMServiceError('Failed to get RAG data', error);
  }
}

/**
 * Get chat session from database
 * @param {string} sessionId - The session ID to look up
 * @returns {Object|null} Chat session object or null if not found
 */
async function getChatSession(sessionId) {
  try {
    if (!sessionId) {
      return null;
    }
    console.log(`[getChatSession] Looking up session: ${sessionId}`);
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    const session = await chatCollection.findOne({ session_id: sessionId });
    
    if (session) {
      console.log(`[getChatSession] Session found: ${sessionId}`);
    } else {
      console.log(`[getChatSession] Session not found: ${sessionId}`);
    }
    
    return session;
  } catch (error) {
    console.error(`[getChatSession] Error looking up session ${sessionId}:`, error);
    throw new LLMServiceError('Failed to get chat session', error);
  }
}

/**
 * Get session messages
 * @param {string} sessionId - The session ID to look up
 * @returns {Array} Array of messages for the session
 */
async function getSessionMessages(sessionId) {
  try {
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    return await chatCollection
      .find({ session_id: sessionId })
      .project({
        'messages.embedding': 0
      })
      .sort({ timestamp: -1 })
      .toArray();
  } catch (error) {
    throw new LLMServiceError('Failed to get session messages', error);
  }
}

/**
 * Get session title
 * @param {string} sessionId - The session ID to look up
 * @returns {Array} Array containing the title
 */
async function getSessionTitle(sessionId) {
  try {
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    return await chatCollection.find({ session_id: sessionId }).project({ title: 1 }).toArray();
  } catch (error) {
    throw new LLMServiceError('Failed to get session title', error);
  }
}

/**
 * Get all sessions for a user
 * @param {string} userId - The user ID to look up
 * @returns {Array} Array of chat sessions for the user
 */
async function getUserSessions(userId, limit = 20, offset = 0) {
  try {
    // Ensure numeric values and enforce bounds
    limit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    offset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    const query = { user_id: userId };

    // Total number of sessions for the user (without pagination)
    const total = await chatCollection.countDocuments(query);

    // Fetch paginated sessions ordered by newest first
    const sessions = await chatCollection
      .find(query)
      // Sort by last_modified if it exists; otherwise fall back to created_at
      .sort({ last_modified: -1, created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return { sessions, total };
  } catch (error) {
    throw new LLMServiceError('Failed to get user sessions', error);
  }
}

/**
 * Update session title
 * @param {string} sessionId - The session ID
 * @param {string} userId - The user ID
 * @param {string} title - The new title
 * @returns {Object} Update result
 */
async function updateSessionTitle(sessionId, userId, title) {
  try {
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    return await chatCollection.updateOne(
      { session_id: sessionId, user_id: userId },
      { $set: { title } }
    );
  } catch (error) {
    throw new LLMServiceError('Failed to update session title', error);
  }
}

/**
 * Delete a chat session
 * @param {string} sessionId - The session ID
 * @param {string} userId - The user ID
 * @returns {Object} Delete result
 */
async function deleteSession(sessionId, userId) {
  try {
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    return await chatCollection.deleteOne({ session_id: sessionId, user_id: userId });
  } catch (error) {
    throw new LLMServiceError('Failed to delete session', error);
  }
}

/**
 * Get user prompts
 * @param {string} userId - The user ID
 * @returns {Array} Array of user prompts
 */
async function getUserPrompts(userId) {
  try {
    const db = await connectToDatabase();
    const promptsCollection = db.collection('prompts');
    return await promptsCollection.find({ user_id: userId }).sort({ created_at: -1 }).toArray();
  } catch (error) {
    throw new LLMServiceError('Failed to get user prompts', error);
  }
}

/**
 * Save a user prompt
 * @param {string} userId - The user ID
 * @param {string} name - The prompt name/title
 * @param {string} text - The prompt text
 * @returns {Object} Update result
 */
async function saveUserPrompt(userId, name, text) {
  try {
    const db = await connectToDatabase();
    const promptsCollection = db.collection('prompts');
    return await promptsCollection.updateOne(
      { user_id: userId },
      { $push: { saved_prompts: { title: name, text } } }
    );
  } catch (error) {
    throw new LLMServiceError('Failed to save user prompt', error);
  }
}

/**
 * Create a new chat session
 * @param {string} sessionId - The session ID
 * @param {string} userId - The user ID
 * @param {string} title - The session title (default: 'Untitled')
 * @returns {Object} Insert result
 */
async function createChatSession(sessionId, userId, title = 'Untitled') {
  try {
    console.log(`[createChatSession] Creating new session: ${sessionId} for user: ${userId} with title: "${title}"`);
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    
    const result = await chatCollection.insertOne({
      session_id: sessionId,
      user_id: userId,
      title,
      created_at: new Date(),
      messages: [],
      last_modified: new Date()
    });
    
    console.log(`[createChatSession] Session created successfully: ${sessionId}`);
    return result;
  } catch (error) {
    console.error(`[createChatSession] Error creating session ${sessionId} for user ${userId}:`, error);
    throw new LLMServiceError('Failed to create chat session', error);
  }
}

/**
 * Add messages to a chat session
 * @param {string} sessionId - The session ID
 * @param {Array} messages - Array of message objects to add
 * @returns {Object} Update result
 */
async function addMessagesToSession(sessionId, messages) {
  try {
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    
    return await chatCollection.updateOne(
      { session_id: sessionId },
      {
        $push: { messages: { $each: messages } },
        $set: { last_modified: new Date() }
      }
    );
  } catch (error) {
    throw new LLMServiceError('Failed to add messages to session', error);
  }
}

/**
 * Get or create chat session
 * @param {string} sessionId - The session ID
 * @param {string} userId - The user ID
 * @param {string} title - The session title (default: 'Untitled')
 * @returns {Object} Chat session object
 */
async function getOrCreateChatSession(sessionId, userId, title = 'Untitled') {
  try {
    let chatSession = await getChatSession(sessionId);
    
    if (!chatSession) {
      await createChatSession(sessionId, userId, title);
      chatSession = await getChatSession(sessionId);
    }
    
    return chatSession;
  } catch (error) {
    throw new LLMServiceError('Failed to get or create chat session', error);
  }
}

/**
 * Save or update summary for a session
 * @param {string} sessionId - The session ID
 * @param {string} summary - The summary text
 * @returns {Object} Update result
 */
async function saveSummary(sessionId, summary) {
  try {
    const db = await connectToDatabase();
    const summaryCollection = db.collection('chatSummaries');
    
    return await summaryCollection.updateOne(
      { session_id: sessionId },
      { $set: { summary, updated_at: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    throw new LLMServiceError('Failed to save summary', error);
  }
}

/**
 * Rate a conversation session
 * @param {string} sessionId - The session ID to rate
 * @param {string} userId - The user ID (for security/validation)
 * @param {number} rating - The rating value (typically 1-5)
 * @returns {Object} Update result
 */
async function rateConversation(sessionId, userId, rating) {
  try {
    console.log(`[rateConversation] Rating session ${sessionId} with rating: ${rating}`);
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');
    
    const result = await chatCollection.updateOne(
      { session_id: sessionId, user_id: userId },
      { $set: { rating, rated_at: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      throw new LLMServiceError(`Session not found or user not authorized: ${sessionId}`);
    }
    
    console.log(`[rateConversation] Session ${sessionId} rated successfully`);
    return result;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    console.error(`[rateConversation] Error rating session ${sessionId}:`, error);
    throw new LLMServiceError('Failed to rate conversation', error);
  }
}

/**
 * Rate a message
 * @param {string} userId - The user ID
 * @param {string} messageId - The message ID
 * @param {number} rating - The rating value (-1, 0, 1)
 * @returns {Object} Update result
 */
async function rateMessage(userId, messageId, rating) {
  try {
    console.log(`[rateMessage] Rating message ${messageId} with rating: ${rating}`);
    const db = await connectToDatabase();
    const chatCollection = db.collection('chat_sessions');

    const result = await chatCollection.updateOne(
      { user_id: userId, 'messages.message_id': messageId },
      { $set: { 'messages.$.rating': rating } }
    );

    if (result.matchedCount === 0) {
      throw new LLMServiceError(`Message not found or user not authorized: ${messageId}`);
    }

    console.log(`[rateMessage] Message ${messageId} rated successfully`);
    return result;
  } catch (error) {
    if (error instanceof LLMServiceError) {
      throw error;
    }
    console.error(`[rateMessage] Error rating message ${messageId}:`, error);
    throw new LLMServiceError('Failed to rate message', error);
  }
}

/**
 * Store message embedding in database
 * @param {string} sessionId - The session ID
 * @param {string} messageId - The message ID
 * @param {Array<number>} embedding - The 1D vector embedding (array of numbers)
 * @returns {Object} Insert result
 */
async function storeMessageEmbedding(sessionId, messageId, embedding) {
  try {
    console.log(`[storeMessageEmbedding] Storing embedding for message ${messageId} in session ${sessionId}`);
    const db = await connectToDatabase();
    const embeddingsCollection = db.collection('message_embeddings');
    
    const result = await embeddingsCollection.insertOne({
      session_id: sessionId,
      message_id: messageId,
      embedding,
      created_at: new Date()
    });
    
    console.log(`[storeMessageEmbedding] Embedding stored successfully for message ${messageId}`);
    return result;
  } catch (error) {
    console.error(`[storeMessageEmbedding] Error storing embedding for message ${messageId}:`, error);
    throw new LLMServiceError('Failed to store message embedding', error);
  }
}

/**
 * Get all embeddings for a session
 * @param {string} sessionId - The session ID to look up
 * @returns {Array} Array of embedding objects for the session
 */
async function getEmbeddingsBySessionId(sessionId) {
  try {
    console.log(`[getEmbeddingsBySessionId] Retrieving embeddings for session: ${sessionId}`);
    const db = await connectToDatabase();
    const embeddingsCollection = db.collection('message_embeddings');
    
    const embeddings = await embeddingsCollection
      .find({ session_id: sessionId })
      .sort({ created_at: 1 })
      .toArray();
    
    console.log(`[getEmbeddingsBySessionId] Found ${embeddings.length} embeddings for session ${sessionId}`);
    return embeddings;
  } catch (error) {
    console.error(`[getEmbeddingsBySessionId] Error retrieving embeddings for session ${sessionId}:`, error);
    throw new LLMServiceError('Failed to get embeddings by session ID', error);
  }
}

/**
 * Get embedding by message ID
 * @param {string} messageId - The message ID to look up
 * @returns {Object|null} Embedding object or null if not found
 */
async function getEmbeddingByMessageId(messageId) {
  try {
    console.log(`[getEmbeddingByMessageId] Retrieving embedding for message: ${messageId}`);
    const db = await connectToDatabase();
    const embeddingsCollection = db.collection('message_embeddings');
    
    const embedding = await embeddingsCollection.findOne({ message_id: messageId });
    
    if (embedding) {
      console.log(`[getEmbeddingByMessageId] Embedding found for message ${messageId}`);
    } else {
      console.log(`[getEmbeddingByMessageId] Embedding not found for message ${messageId}`);
    }
    
    return embedding;
  } catch (error) {
    console.error(`[getEmbeddingByMessageId] Error retrieving embedding for message ${messageId}:`, error);
    throw new LLMServiceError('Failed to get embedding by message ID', error);
  }
}

/**
 * Get database collections commonly used in chat operations
 * @returns {Object} Object containing database and collection references
 */
async function getChatCollections() {
  try {
    const db = await connectToDatabase();
    return {
      db,
      chatCollection: db.collection('chat_sessions'),
      summaryCollection: db.collection('chatSummaries'),
      modelCollection: db.collection('modelList'),
      ragCollection: db.collection('ragList')
    };
  } catch (error) {
    throw new LLMServiceError('Failed to get database collections', error);
  }
}

module.exports = {
  getModelData,
  getActiveModels,
  getActiveRagDatabases,
  getRagData,
  getChatSession,
  getSessionMessages,
  getSessionTitle,
  getUserSessions,
  updateSessionTitle,
  deleteSession,
  getUserPrompts,
  saveUserPrompt,
  createChatSession,
  addMessagesToSession,
  getOrCreateChatSession,
  saveSummary,
  rateConversation,
  rateMessage,
  storeMessageEmbedding,
  getEmbeddingsBySessionId,
  getEmbeddingByMessageId,
  getChatCollections
}; 