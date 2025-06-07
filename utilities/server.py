from flask import Flask, request, jsonify
import os, json
import tfidf_vectorizer as tv
from tokenizer import count_tokens
from rag import rag_handler
from text_utils import create_query_from_messages

app = Flask(__name__)

file_path = os.path.dirname(os.path.realpath(__file__))

# TODO: add error checking to each function

@app.route('/encode', methods=["POST"])
def call_encode_query():
    data = request.get_json()
    query_embedding_array = tv.encode_query(data) 
    return jsonify({"query_embedding": query_embedding_array}), 200

@app.route('/count_tokens', methods=["POST"])
def tokenize_query():
    data = request.get_json()
    number_of_tokens = count_tokens(data['text_list']) 
    return jsonify({ 'message': 'success', 'token_count': number_of_tokens }), 200

@app.route('/get_prompt_query', methods=["POST"])
def get_prompt_query():
    data = request.get_json()
    # Function assumes the first message is the user's query
    prompt_query = create_query_from_messages(data['query'], data['messages'], data['system_prompt'], data['max_tokens'])
    return jsonify({ 'message': 'success', 'prompt_query': prompt_query }), 200

@app.route('/test', methods=["GET"])
def test_server():
    return jsonify({'status': 'success'})

@app.route('/rag', methods=["POST"])
def rag():
    data = request.get_json()
    response = rag_handler(data['query'], data['rag_db'], data['user_id'], data['model'], data['num_docs'], data['session_id'])
    return jsonify(response), 200

if __name__ == "__main__":
    app.run(host='0.0.0.0',port=5000)

