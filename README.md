# Chat API with OpenAI and MongoDB

This project is a Node.js-based API that leverages OpenAI's language models to facilitate chat interactions. It uses Express for handling HTTP requests and MongoDB for storing chat sessions and messages.

## Features

- **Chat with OpenAI**: Send messages to OpenAI's language model and receive responses.
- **Session Management**: Create and manage chat sessions, storing messages in MongoDB.
- **Retrieve Chat History**: Fetch chat history for a specific session.
- **Generate Session Titles**: Automatically generate descriptive titles for chat sessions.

## Prerequisites

- Node.js (v14 or later)
- MongoDB instance
- OpenAI API key

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/chat-api.git
   cd chat-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   - Create a `config.json` file in the root directory with the following structure:
     ```json
     {
       "openaiApiKey": "your-openai-api-key",
       "openaiBaseUrl": "https://api.openai.com/v1",
       "mongoDBUrl": "your-mongodb-connection-string",
       "model": "gpt-3.5-turbo"
     }
     ```

4. **Start the server**:
   ```bash
   npm start
   ```

   The server will run on `http://localhost:3000` by default.

## API Endpoints

### Chat Endpoints

- **POST /api/copilot-chat**: Send a message to the chat model and receive a response.
  - Request body: `{ "query": "your message", "session_id": "session-id", "user_id": "user-id" }`
  - Response: `{ "message": "success", "response": { "role": "assistant", "content": "response message" } }`

- **GET /api/start-chat**: Generate a new unique session ID.
  - Response: `{ "message": "created session id", "session_id": "new-session-id" }`

- **GET /api/get-chats**: Retrieve chat history by session ID. *(Implementation needed)*

- **GET /api/get-all-sessions**: Retrieve all session IDs for a user.
  - Query parameter: `user_id`
  - Response: `{ "sessions": [ { "session_id": "id", "title": "title", "created_at": "date" }, ... ] }`

- **POST /api/put-chat-entry**: Insert a chat entry into the database. *(Implementation needed)*

- **POST /api/generate-title**: Generate a session title from the initial prompt.
  - Request body: `{ "query": "initial prompt" }`
  - Response: `{ "message": "success", "response": { "role": "assistant", "content": "generated title" } }`

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
