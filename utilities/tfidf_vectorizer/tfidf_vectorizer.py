import pickle, os, sys
import numpy as np
from scipy.sparse import load_npz
from sklearn.feature_extraction.text import TfidfVectorizer

file_path = os.path.dirname(os.path.realpath(__file__))
print(f'file_path = {file_path}')

# Function to load vectorizer dynamically from a .npy file
def load_vectorizer(vectorizers, vectorizer_name):
    if vectorizer_name not in vectorizers:
        try:
            vector_file = os.path.join(file_path,'vectors',f'{vectorizer_name}.npy')
            print(f'vector_file = {vector_file}')
            vectorizer = np.load(vector_file, allow_pickle=True).item()
            vectorizers[vectorizer_name] = vectorizer
        except FileNotFoundError:
            return None
    return vectorizers[vectorizer_name]

def encode_query(data):
    query = data.get("query")
    vectorizer_name = data.get("vectorizer")  # Pass the vectorizer name

    # Dictionary to store preloaded vectorizers
    vectorizers = {}

    if not query:
        return 'ERROR_QUERY'
    if not vectorizer_name:
        return 'ERROR_VECTOR_NAME'

    vectorizer = load_vectorizer(vectorizers, vectorizer_name)
    print(f'vectorizer = {vectorizer}')
    if vectorizer is None:
        return 'ERROR_VECTOR_NOT_FOUND'

    # Transform the query using the selected vectorizer
    query_embedding = vectorizer.transform([query])

    # Convert sparse matrix to dense array
    query_embedding_array = query_embedding.toarray().tolist()

    return query_embedding_array


