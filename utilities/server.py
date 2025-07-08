from flask import Flask, request, jsonify
import os, json
import tfidf_vectorizer as tv
from tokenizer import count_tokens
from rag import rag_handler
from text_utils import create_query_from_messages
from state_utils import get_path_state
import logging
from datetime import datetime

app = Flask(__name__)

file_path = os.path.dirname(os.path.realpath(__file__))

# ---------------------------------------------------------------------------
# Access logging (Apache combined log format)
# ---------------------------------------------------------------------------
# This sets up a dedicated logger that writes one line per request in the same
# "combined" format produced by Apache's access logs.
# Example line:
# 127.0.0.1 - - [10/Jul/2025:21:15:05 +0000] "GET /test HTTP/1.1" 200 17 "-" "curl/7.81.0"

access_log_path = os.path.join(file_path, "access.log")
access_logger = logging.getLogger("access")
access_logger.setLevel(logging.INFO)

# Avoid duplicating handlers if this file is reloaded (e.g., in debug mode)
if not access_logger.handlers:
    handler = logging.FileHandler(access_log_path)
    handler.setFormatter(logging.Formatter("%(message)s"))
    access_logger.addHandler(handler)

# Log every request after it is processed
@app.after_request
def log_request(response):
    """Write an Apache-style access log entry for every request."""
    # Timestamp in Apache format
    timestamp = datetime.utcnow().strftime("%d/%b/%Y:%H:%M:%S +0000")

    # Build the request line: "METHOD PATH PROTOCOL"
    request_line = f"{request.method} {request.full_path if request.full_path else request.path} {request.environ.get('SERVER_PROTOCOL')}"

    # Bytes sent to the client. If unknown, use '-'.
    bytes_sent = response.calculate_content_length() or "-"

    log_parts = [
        request.remote_addr or "-",
        "-",                       # remote logname (unused)
        "-",                       # remote user (unused)
        f"[{timestamp}]",
        f'"{request_line}"',
        response.status_code,
        bytes_sent,
        f'"{request.headers.get("Referer", "-")}"',
        f'"{request.headers.get("User-Agent", "-")}"',
    ]

    access_logger.info(" ".join(map(str, log_parts)))
    return response

# TODO: add error checking to each function

@app.route('/tfidf_encode', methods=["POST"])
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

@app.route('/get_path_state', methods=["POST"])
def path_state():
    data = request.get_json()
    print('data', data)
    path_state = get_path_state(data['path'])
    return jsonify(path_state), 200

@app.route('/rag', methods=["POST"])
def rag():
    data = request.get_json()
    response = rag_handler(data['query'], data['rag_db'], data['user_id'], data['model'], data['num_docs'], data['session_id'])
    return jsonify(response), 200

if __name__ == "__main__":
    app.run(host='0.0.0.0',port=5000)

