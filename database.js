// database.js

const { MongoClient } = require('mongodb');
const config = require('./utilities/mongodb_config.json'); // Load from utilities directory

// MongoDB setup
const mongoUri = config['mongoDBUrl'];
const mongoClient = new MongoClient(mongoUri);

/**
 * Connect to MongoDB
 * @returns {Object} MongoDB database instance
 */
async function connectToDatabase() {
    if (!mongoClient.isConnected) {
        await mongoClient.connect();
        console.log('Connected to MongoDB');
    }
    return mongoClient.db('copilot'); // Specify database name
}

/**
 * Delete session from database
 * TODO: UNTESTED
 * @param {string} sessionId - The session ID to delete
 * @param {string} userId - The user ID associated with the session
 * @returns {Object} Result of the delete operation
 */
async function removeBySession(sessionId, userId) {
    if (!sessionId || !userId) {
        throw new Error('Both session ID and user ID are required to delete a session.');
    }

    // Connect to the database
    const db = await connectToDatabase();
    const sessionsCollection = db.collection('chat_sessions');

    // Delete session document
    const deleteResult = await sessionsCollection.deleteOne({
        sessionId,
        userId
    });

    // Log result of delete operation
    if (deleteResult.deletedCount === 1) {
        console.log(`Session deleted: session_id=${sessionId}, user_id=${userId}`);
    } else {
        console.log(`Session not found or unauthorized: session_id=${sessionId}, user_id=${userId}`);
    }

    return deleteResult;
}


module.exports = { connectToDatabase, removeBySession };
