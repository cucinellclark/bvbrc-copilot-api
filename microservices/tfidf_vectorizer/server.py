from flask import Flask, request, jsonify
import pickle, os, sys
import numpy as np
from scipy.sparse import load_npz
from sklearn.feature_extraction.text import TfidfVectorizer

app = Flask(__name__)

file_path = os.path.dirname(os.path.realpath(__file__))

# Dictionary to store preloaded vectorizers
vectorizers = {}

# Function to load vectorizer dynamically from a .npy file
def load_vectorizer(vectorizer_name):
    if vectorizer_name not in vectorizers:
        try:
            vector_file = os.path.join(file_path,'vectors',f'{vectorizer_name}.npy')
            print(f'vector_file = {vector_file}')
            vectorizer = np.load(vector_file, allow_pickle=True).item()
            vectorizers[vectorizer_name] = vectorizer
        except FileNotFoundError:
            return None
    return vectorizers[vectorizer_name]

@app.route("/encode", methods=["POST"])
def encode_query():
    data = request.get_json()
    print(f'data = {data}')
    query = data.get("query")
    vectorizer_name = data.get("vectorizer")  # Pass the vectorizer name

    if not query:
        return jsonify({"error": "Query is required"}), 400
    if not vectorizer_name:
        return jsonify({"error": "Vectorizer name is required"}), 400

    vectorizer = load_vectorizer(vectorizer_name)
    print(f'vectorizer = {vectorizer}')
    if vectorizer is None:
        return jsonify({"error": f"Vectorizer '{vectorizer_name}' not found"}), 404

    # Transform the query using the selected vectorizer
    query_embedding = vectorizer.transform([query])

    # Convert sparse matrix to dense array
    query_embedding_array = query_embedding.toarray().tolist()

    return jsonify({"query_embedding": query_embedding_array}), 200

@app.route('/test', methods=["GET"])
def test_server():
    return jsonify({'status': 'success'})

if __name__ == "__main__":
    app.run(host='0.0.0.0',port=5000)

