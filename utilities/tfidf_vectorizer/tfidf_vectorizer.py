import pickle, os, sys
import numpy as np
from scipy.sparse import load_npz
from sklearn.feature_extraction.text import TfidfVectorizer
from datasets import load_from_disk
from .faiss_helper import faiss_search_dataset

file_path = os.path.dirname(os.path.realpath(__file__))

# Function to load vectorizer dynamically from a .npy file
def load_vectorizer_by_name(vectorizers, vectorizer_name):
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

    vectorizer = load_vectorizer_by_name(vectorizers, vectorizer_name)
    print(f'vectorizer = {vectorizer}')
    if vectorizer is None:
        return 'ERROR_VECTOR_NOT_FOUND'

    # Transform the query using the selected vectorizer
    query_embedding = vectorizer.transform([query])

    # Convert sparse matrix to dense array
    query_embedding_array = query_embedding.toarray().tolist()

    return query_embedding_array

def encode_query_from_dataset(query, dataset):
    """
    Encode a query using TF-IDF vectorizer data stored in a Hugging Face dataset.
    
    Args:
        query: Query string to encode
        dataset: Hugging Face dataset containing TF-IDF vectorizer data
        
    Returns:
        List representation of the query embedding
    """
    try:
        # Extract vectorizer components from the dataset
        # Access vocabulary and idf_values as column arrays
        vocabulary_list = dataset['vocabulary']
        idf_values = dataset['idf_values']
        
        # Create vocabulary mapping from list (word -> index)
        vocabulary = {word: idx for idx, word in enumerate(vocabulary_list)}
        
        # Get vocab size and embedding dimension
        vocab_size = len(vocabulary_list)
        embedding_dim = len(idf_values)
        
        print(f"Vocabulary size: {vocab_size}")
        print(f"Embedding dimension: {embedding_dim}")
        
        # Create a new TfidfVectorizer and set its vocabulary and idf values
        vectorizer = TfidfVectorizer()
        
        # Set vocabulary
        vectorizer.vocabulary_ = vocabulary
        
        # Set IDF values
        vectorizer.idf_ = np.array(idf_values)
        
        # Transform the query
        query_embedding = vectorizer.transform([query])
        
        # Convert sparse matrix to dense array and return as list
        query_embedding_array = query_embedding.toarray().tolist()
        
        return query_embedding_array
        
    except Exception as e:
        print(f"Error encoding query from dataset: {e}")
        return None

def load_vectorizer_by_path(vectorizers, dataset_path):
    """
    Load a Hugging Face dataset instead of a vectorizer.
    
    Args:
        vectorizers: Dictionary to cache loaded datasets
        dataset_path: Path or name of the Hugging Face dataset
        
    Returns:
        The loaded dataset
    """
    if dataset_path not in vectorizers:
        try:
            # Load Hugging Face dataset
            dataset = load_from_disk(dataset_path)
            vectorizers[dataset_path] = dataset
            print(f"Successfully loaded Hugging Face dataset: {dataset_path}")
        except Exception as e:
            print(f"Error loading Hugging Face dataset {dataset_path}: {e}")
            return None
    return vectorizers[dataset_path]

def load_dataset_by_path(dataset_path):
    """
    Load a Hugging Face dataset.
    
    Args:
        dataset_path: Path or name of the Hugging Face dataset
    
    Returns:
        The loaded dataset
    """
    dataset = load_from_disk(dataset_path)
    return dataset

def tfidf_search(query, rag_db, embeddings_path, dataset_path):
    """
    Process a user query using a Hugging Face dataset and return a response.
    
    Args:
        query: User query string
        rag_db: RAG database name
        embeddings_path: Path to embeddings
        dataset_path: Path or name of the Hugging Face dataset
        
    Returns:
        Dict containing the response
    """
    try:
        print(f"TF-IDF Chat: Processing query for rag_db '{rag_db}'")
        
        # Dictionary to store preloaded datasets
        vectorizers = {}
        
        # Load the Hugging Face dataset
        vectorizer_dataset = load_vectorizer_by_path(vectorizers, dataset_path)
        if vectorizer_dataset is None:
            return {
                'message': 'ERROR_DATASET_NOT_FOUND',
                'system_prompt': 'The Vectorizer Hugging Face dataset was not found. Please check the dataset name and try again.'
            }
        text_dataset = load_dataset_by_path(embeddings_path)
        if text_dataset is None:
            return {
                'message': 'ERROR_DATASET_NOT_FOUND',
                'system_prompt': 'The Text Hugging Face dataset was not found. Please check the dataset name and try again.'
            }

        query_embedding = encode_query_from_dataset(query, vectorizer_dataset)

        documents = faiss_search_dataset(query_embedding, text_dataset)

        return documents

    except Exception as e:
        print(f"Error in tfidf_chat: {e}")
        return {
            'message': 'ERROR',
            'system_prompt': f'An error occurred while processing the query: {str(e)}'
        }