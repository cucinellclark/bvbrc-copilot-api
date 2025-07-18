import faiss
import numpy as np
import pickle
import os
from typing import List, Dict, Any, Optional

def faiss_search_dataset(query_embedding: List[List[float]], dataset, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Perform FAISS similarity search using query embeddings.
    dataset can be a PyArrow Table or something having `.to_table()`.
    """
    try:
        # Convert query embedding to numpy array
        query_vector = np.array(query_embedding, dtype=np.float32)
        if query_vector.ndim == 2:
            query_vector = query_vector.reshape(1, -1)  # Ensure shape is (1, embedding_dim)
        
        # Ensure we have a Table
        if hasattr(dataset, "to_table"):
            table = dataset.to_table()
        else:
            table = dataset
        
        # Extract embeddings from the dataset
        embeddings = np.array(table.column('embedding').to_pylist(), dtype=np.float32)
        print(f"Extracted {embeddings.shape[0]} embeddings with dimension {embeddings.shape[1]}")
        
        # Create FAISS index
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity for normalized vectors)
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(embeddings)
        faiss.normalize_L2(query_vector)
        
        # Add embeddings to index
        index.add(embeddings)
        print(f"Created FAISS index with {index.ntotal} vectors")

        semantic_score_filter = 0.01
        
        # Perform similarity search
        distances, indices = index.search(query_vector, top_k)
        
        # Prepare results
        results = []
        for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
            if idx == -1:  # FAISS returns -1 for invalid indices
                continue
            if distance < semantic_score_filter:
                continue
                
            result = {
                'index': int(idx),
                'similarity_score': float(distance),
                'rank': i + 1
            }
            
            # Add document metadata from the dataset
            if idx < len(table):
                # Get the document at this index from the PyArrow table
                doc = {
                    'id': table.column('id')[idx].as_py() if 'id' in table.column_names else None,
                    'doc_id': table.column('doc_id')[idx].as_py() if 'doc_id' in table.column_names else None,
                    'chunk_index': table.column('chunk_index')[idx].as_py() if 'chunk_index' in table.column_names else None,
                    'text': table.column('text')[idx].as_py() if 'text' in table.column_names else None,
                    'source': table.column('source')[idx].as_py() if 'source' in table.column_names else None,
                    'embedding_model': table.column('embedding_model')[idx].as_py() if 'embedding_model' in table.column_names else None,
                    'embedding_dim': table.column('embedding_dim')[idx].as_py() if 'embedding_dim' in table.column_names else None
                }
                result.update(doc)
            else:
                result['text'] = f"Document {idx}"  # Fallback if no metadata
                
            results.append(result)

        print(f"Found {len(results)} similar documents")
        return results
        
    except Exception as e:
        print(f"Error in FAISS search: {e}")
        return []


def create_faiss_index(embeddings: np.ndarray, metadata: List[Dict[str, Any]], save_path: str) -> bool:
    """
    Create and save a FAISS index from embeddings and metadata.
    
    Args:
        embeddings: Numpy array of shape (n_documents, embedding_dim)
        metadata: List of dictionaries containing document metadata
        save_path: Directory path to save the index and metadata
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure embeddings are float32
        embeddings = embeddings.astype(np.float32)
        
        # Create FAISS index
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity for normalized vectors)
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(embeddings)
        
        # Add embeddings to index
        index.add(embeddings)
        
        # Create save directory if it doesn't exist
        os.makedirs(save_path, exist_ok=True)
        
        # Save index
        index_path = os.path.join(save_path, "index.faiss")
        faiss.write_index(index, index_path)
        
        # Save metadata
        metadata_path = os.path.join(save_path, "metadata.pkl")
        with open(metadata_path, 'wb') as f:
            pickle.dump(metadata, f)
        
        print(f"Successfully created FAISS index with {index.ntotal} vectors at {save_path}")
        return True
        
    except Exception as e:
        print(f"Error creating FAISS index: {e}")
        return False


def load_embeddings_from_sparse(sparse_matrix_path: str) -> Optional[np.ndarray]:
    """
    Load embeddings from a sparse matrix file (e.g., .npz format).
    
    Args:
        sparse_matrix_path: Path to the sparse matrix file
        
    Returns:
        Dense numpy array of embeddings or None if failed
    """
    try:
        from scipy.sparse import load_npz
        
        sparse_matrix = load_npz(sparse_matrix_path)
        dense_matrix = sparse_matrix.toarray()
        
        print(f"Loaded sparse matrix with shape {dense_matrix.shape}")
        return dense_matrix.astype(np.float32)
        
    except Exception as e:
        print(f"Error loading sparse matrix: {e}")
        return None 