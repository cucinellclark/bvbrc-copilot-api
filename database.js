// database.js

const { MongoClient } = require('mongodb');
const config = require('./config.json'); // Adjust path as needed

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
    return mongoClient.db('dev_chat'); // Specify database name
}

module.exports = { connectToDatabase };
