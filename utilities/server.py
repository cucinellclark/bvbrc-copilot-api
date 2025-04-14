from flask import Flask, request, jsonify
import os
import tfidf_vectorizer as tv
from tokenizer import count_tokens

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
    number_of_tokens = count_tokens(data['query']) 
    return jsonify({ 'token_count': number_of_tokens }), 200

@app.route('/test', methods=["GET"])
def test_server():
    return jsonify({'status': 'success'})

if __name__ == "__main__":
    app.run(host='0.0.0.0',port=5000)

