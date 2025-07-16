import pickle, os, sys, re
import numpy as np
import pyarrow as pa
from scipy.sparse import load_npz
from sklearn.feature_extraction.text import TfidfVectorizer
import pyarrow.dataset as ds
from .faiss_helper import faiss_search_dataset

# Regex patterns to identify files
VECTORIZER_FILE_PATTERN = re.compile(r"vectorizer_components\.arrow$")
EMBEDDING_FILE_PATTERN = re.compile(r"tfidf_embeddings_batch_\d+\.arrow$")

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

# ----- modified loader helpers ------------------------------------------------

def _find_files(directory: str, pattern: re.Pattern):
    """Return full paths of files in *directory* whose filename matches *pattern*."""
    return [os.path.join(directory, f) for f in os.listdir(directory) if pattern.match(f)]

def load_vectorizer_by_path(vectorizers, dataset_dir):
    """
    Load the vectorizer components stored in `vectorizer_components.arrow` files.
    Returns a PyArrow Table containing at least the columns 'vocabulary' and 'idf_values'.
    """
    if dataset_dir not in vectorizers:
        try:
            vec_files = _find_files(dataset_dir, VECTORIZER_FILE_PATTERN)
            if not vec_files:
                print(f"No vectorizer_components.arrow file(s) found in {dataset_dir}")
                return None
            
            tables = []
            for fpath in sorted(vec_files):
                print(f"Loading vectorizer components from: {fpath}")
                with pa.memory_map(fpath, 'r') as source:
                    reader = pa.ipc.open_file(source)
                    tables.append(reader.read_all())
            
            if len(tables) == 1:
                table = tables[0]
            else:
                table = pa.concat_tables(tables, promote=True)
                
            vectorizers[dataset_dir] = table
            print(f"Vectorizer components loaded (rows: {table.num_rows})")
        except Exception as e:
            print(f"Error loading vectorizer components from {dataset_dir}: {e}")
            return None
    return vectorizers[dataset_dir]

def load_dataset_by_path(dataset_dir):
    """
    Load all embedding batches (tfidf_embeddings_batch_*.arrow) under *dataset_dir*.
    Returns a concatenated PyArrow Table with at least an 'embedding' column.
    """
    try:
        embed_files = _find_files(dataset_dir, EMBEDDING_FILE_PATTERN)
        if not embed_files:
            print(f"No embedding batch files found in {dataset_dir}")
            return None
        tables = []
        for fpath in sorted(embed_files):
            print(f"Reading embeddings batch: {os.path.basename(fpath)}")
            with pa.memory_map(fpath, 'r') as source:
                reader = pa.ipc.open_file(source)
                tables.append(reader.read_all())
        combined_table = pa.concat_tables(tables, promote=True)
        print(f"Combined embeddings rows: {combined_table.num_rows}")
        return combined_table
    except Exception as e:
        print(f"Error loading embedding batches from {dataset_dir}: {e}")
        return None

# ----- encode/query functions adjustments ------------------------------------

def encode_query_from_dataset(query, dataset_table):
    """
    Encode a query using TF-IDF vectorizer data stored in a PyArrow Table.
    """
    try:
        # Ensure we have a Table
        if hasattr(dataset_table, "to_table"):
            table = dataset_table.to_table()
        else:
            table = dataset_table

        vocabulary_list = table.column('vocabulary').to_pylist()
        idf_values = table.column('idf_values').to_pylist()
        vocabulary = {word: idx for idx, word in enumerate(vocabulary_list)}
        vectorizer = TfidfVectorizer()
        vectorizer.vocabulary_ = vocabulary
        vectorizer.idf_ = np.array(idf_values)
        query_embedding = vectorizer.transform([query])
        return query_embedding.toarray().tolist()
    except Exception as e:
        print(f"Error encoding query from dataset: {e}")
        return None

def tfidf_search(query, rag_db, embeddings_path, vectorizer_path):
    """Search with TF-IDF using files in *dataset_dir* (both vectorizer & embeddings)."""
    try:
        print(f"TF-IDF search for rag_db='{rag_db}' using data dir '{embeddings_path}'")
        vectorizers_cache = {}
        vectorizer_table = load_vectorizer_by_path(vectorizers_cache, vectorizer_path)
        if vectorizer_table is None:
            return {'message': 'ERROR_VECTORIZER_NOT_FOUND',
                    'system_prompt': 'Vectorizer components not found.'}
        embeddings_table = load_dataset_by_path(embeddings_path)
        if embeddings_table is None:
            return {'message': 'ERROR_EMBEDDINGS_NOT_FOUND',
                    'system_prompt': 'Embedding batches not found.'}
        query_embedding = encode_query_from_dataset(query, vectorizer_table)
        documents = faiss_search_dataset(query_embedding, embeddings_table)
        return documents
    except Exception as e:
        print(f"Error in tfidf_search: {e}")
        return {'message': 'ERROR', 'system_prompt': str(e)}