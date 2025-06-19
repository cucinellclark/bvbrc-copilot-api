import json
import requests
from typing import Optional, Dict, Any
from mongo_helper import get_rag_configs
from distllm.distllm.chat import distllm_chat
from corpus_search.search import search_corpus
from tfidf_vectorizer.tfidf_vectorizer import tfidf_search

def rag_handler(query, rag_db, user_id, model, num_docs, session_id):
    """
    Main RAG handler that queries MongoDB for configuration and dispatches to 
    the appropriate RAG function based on the 'program' field.
    
    Args:
        query: User query string
        rag_db: RAG database name
        user_id: User identifier
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier
        
    Returns:
        Dict containing the response and any additional data
    """
    try:
        # Query MongoDB for RAG configuration
        rag_config_list = get_rag_configs(rag_db)

        if not rag_config_list or len(rag_config_list) == 0:
            raise ValueError(f"No RAG configurations found for database '{rag_db}'")

        if len(rag_config_list) > 1:
            return multi_rag_handler(query, rag_db, user_id, model, num_docs, session_id, rag_config_list)
        rag_config = rag_config_list[0]

        if not rag_config:
            raise ValueError(f"RAG database '{rag_db}' not found in MongoDB")
        
        # Get the program field to determine which RAG function to call
        program = rag_config.get('program', 'default')
        
        print(f"RAG Handler: Using program '{program}' for rag_db '{rag_db}'")

        if program == 'default':
            raise ValueError(f"RAG program not found in MongoDB")
        
        # Dispatch to appropriate RAG function based on program field
        if program == 'distllm':
            return distllm_rag(query, rag_db, user_id, model, num_docs, session_id, rag_config)
        elif program == 'corpus_search':
            value = corpus_search_rag(query, rag_db, user_id, model, num_docs, session_id)
            return value
        elif program == 'tfidf':
            return tfidf_rag(query, rag_db, user_id, model, num_docs, session_id, rag_config)
        else:
            raise ValueError(f"Unknown RAG program '{program}'. Available programs: distllm, corpus_search, chroma, default")
            
    except Exception as e:
        print(f"Error in rag_handler: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process RAG request',
            'rag_db': rag_db,
            'program': program if 'program' in locals() else 'unknown'
        }

def multi_rag_handler(query, rag_db, user_id, model, num_docs, session_id, rag_config_list):
    """
    Handle RAG requests using multiple RAG configurations.
    
    Args:
        query: User query string
        rag_db: RAG database name
        user_id: User identifier
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier
        rag_config_list: List of RAG configurations
        
    Returns:
        Dict containing the response
    """
    try:
        print(f"Multi-RAG Handler: Processing query for rag_db '{rag_db}'")
        
        # Validate that we have exactly 2 RAG configurations
        if len(rag_config_list) != 2:
            raise ValueError(f"Multi-RAG handler requires exactly 2 configurations, but got {len(rag_config_list)}")
        
        # Extract program fields from both configurations
        programs = [config.get('program', 'default') for config in rag_config_list]
        
        # Validate that we have one 'tfidf' and one 'distllm' configuration
        if not ('tfidf' in programs and 'distllm' in programs):
            raise ValueError(f"Multi-RAG handler requires one 'tfidf' and one 'distllm' configuration, but got programs: {programs}")
        
        # Initialize a list to store results from each RAG configuration
        results = []
        
        # Process each RAG configuration in the list - TF-IDF first, then distLLM
        # Sort configurations to ensure tfidf runs before distllm
        sorted_configs = sorted(rag_config_list, key=lambda x: 0 if x.get('program') == 'tfidf' else 1)
        tfidf_config = sorted_configs[0]
        distllm_config = sorted_configs[1]
        if tfidf_config.get('program') != 'tfidf':
            raise ValueError(f"TF-IDF configuration is not valid: {tfidf_config}")
        if distllm_config.get('program') != 'distllm':
            raise ValueError(f"distLLM configuration is not valid: {distllm_config}")
        
        tfidf_results = tfidf_search_only(query, rag_db, user_id, model, num_docs, session_id, tfidf_config)
        tfidf_string = '\n\n'.join(tfidf_results)
        distllm_results = distllm_rag(query, rag_db, user_id, model, num_docs, session_id, distllm_config, tfidf_string)
        documents = distllm_results['documents'] + tfidf_results

        # Combine results from all RAG configurations
        combined_response = {
            'message': 'success',
            'response': distllm_results['response'],
            'system_prompt': distllm_results['system_prompt'],
            'documents': documents
        }
        
        return combined_response
    
    except Exception as e:
        print(f"Error in multi_rag_handler: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process multi-RAG request',
            'rag_db': rag_db,
            'program': 'multi_rag'
        }

# Returns a JSON object with the following fields:
# - message: success
# - response: the response from the RAG
# - system_prompt: the system prompt used which contains the returned documents
def distllm_rag(query, rag_db, user_id, model, num_docs, session_id, rag_config, extra_context: Optional[str] = None):
    """
    Handle RAG requests using distLLM implementation.
    
    Args:
        query: User query string
        rag_db: RAG database name
        user_id: User identifier  
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier
        extra_context: Optional extra context to include in the system prompt
    Returns:
        Dict containing the response
    """
    try:
        print(f"distLLM RAG: Processing query for rag_db '{rag_db}'")
        
        # get the datapath from the rag_config
        if 'data' not in rag_config:
            raise ValueError("data not found in rag_config")
        if 'dataset_dir' not in rag_config['data'] or 'faiss_index_path' not in rag_config['data']:
            raise ValueError("dataset_dir or faiss_index_path not found in rag_config")
        data_path = rag_config['data']['dataset_dir']
        faiss_index_path = rag_config['data']['faiss_index_path']

        # Call the distllm_chat function
        result_json = distllm_chat(query, rag_db, data_path, faiss_index_path, extra_context)
        result = json.loads(result_json)
        
        return {
            'message': 'success',
            'response': result.get('response', ''),
            'system_prompt': result.get('system_prompt', ''),
            'documents': result.get('documents', [])
        }
        
    except Exception as e:
        print(f"Error in distllm_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process distLLM RAG request',
            'program': 'distllm',
            'rag_db': rag_db
        }

def tfidf_rag(query, rag_db, user_id, model, num_docs, session_id, rag_config):
    """
    Handle RAG requests using TF-IDF implementation.
    
    Args:
        query: User query string
        rag_db: RAG database name
        user_id: User identifier
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier

    Returns:
        Dict containing the response
    """
    try:
        print(f"TF-IDF RAG: Processing query for rag_db '{rag_db}'")

        embeddings_path = rag_config['data']['embeddings_path']
        vectorizer_path = rag_config['data']['vectorizer_path']
        
        # Call the tfidf_chat function
        results = tfidf_search(query, rag_db, embeddings_path, vectorizer_path)
        text_list = [res['text'] for res in results]

        conversation_text = '\n\n'.join(text_list)
        conversation_text = (
            f"Here are the top documents "
            f"retrieved from the corpus. Use these documents to answer the user's question "
            f"if possible, otherwise just answer the question based on your knowledge:\n\n"
            f"{conversation_text}"
        )

        response = chat_only_request(query, model, conversation_text)
        response['system_prompt'] = conversation_text
        response['documents'] = text_list
        return response

    except Exception as e:
        print(f"Error in tfidf_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process TF-IDF RAG request',
            'program': 'tfidf',
            'rag_db': rag_db
        }

def tfidf_search_only(query, rag_db, user_id, model, num_docs, session_id, rag_config):
    try:
        print(f"TF-IDF RAG: Processing query for rag_db '{rag_db}'")

        embeddings_path = rag_config['data']['embeddings_path']
        vectorizer_path = rag_config['data']['vectorizer_path']
        
        # Call the tfidf_chat function
        results = tfidf_search(query, rag_db, embeddings_path, vectorizer_path)
        text_list = [res['text'] for res in results]
        
        return text_list

        
    except Exception as e:
        print(f"Error in tfidf_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process TF-IDF search',
            'program': 'tfidf',
            'rag_db': rag_db
        }

def corpus_search_rag(query, rag_db, user_id, model, num_docs, session_id):
    """
    Handle RAG requests using corpus search implementation.
    
    Args:
        query: User query string
        rag_db: RAG database name
        user_id: User identifier
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier
        
    Returns:
        Dict containing the search results
    """
    try:
        print(f"Corpus Search RAG: Processing query for rag_db '{rag_db}'")
        
        # Default parameters for corpus search
        strategies = None  # Use all available strategies
        fusion = "rrf"     # Reciprocal rank fusion
        required_tags = []
        excluded_tags = []
        
        # Call the corpus search function
        results = search_corpus(
            corpus=rag_db,
            query=query,
            strategies=strategies,
            top_k=int(num_docs),
            fusion=fusion,
            required_tags=required_tags,
            excluded_tags=excluded_tags
        )

        conversation_text = '\n\n'.join(results)
        conversation_text = (
            f"Here are the top {num_docs} documents "
            f"retrieved from the corpus. Use these documents to answer the user's question "
            f"if possible, otherwise just answer the question based on your knowledge:\n\n"
            f"{conversation_text}"
        )

        response = chat_only_request(query, model, conversation_text)
        response['system_prompt'] = conversation_text
        
        return response
        
    except Exception as e:
        print(f"Error in corpus_search_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process corpus search RAG request',
            'program': 'corpus_search',
            'rag_db': rag_db
        }

# TODO: change hardcoded port to config
def chat_only_request(query: str, model: str, system_prompt: Optional[str] = None, 
                     base_url: str = "http://127.0.0.1:7032/copilot-api/chatbrc", 
                     auth_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Helper function to make requests to the /chat-only endpoint.
    
    Args:
        query (str): The user query/message to send
        model (str): The model name to use for the chat
        system_prompt (str, optional): Optional system prompt to guide the model
        base_url (str): Base URL of the API server (default: http://127.0.0.1:7032/copilot-api/chatbrc)
        auth_token (str, optional): Authentication token if required
        
    Returns:
        Dict containing the API response
        
    Raises:
        requests.RequestException: If the HTTP request fails
        ValueError: If required parameters are missing
    """
    if not query or not model:
        raise ValueError("Both 'query' and 'model' are required parameters")
    
    # Prepare the messages array
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]
    
    # Prepare the request payload to match queryRequestChat function
    payload = {
        "model": model,
        "query": query,
        "system_prompt": system_prompt
    }
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json"
    }
    
    # Add authentication header
    # TODO: change to use config
    headers["Authorization"] = f"Bearer un=clark.cucinell@patricbrc.org|tokenid=6426bfed-5570-4139-9c73-f60dd82f4190|expiry=1763908486|client_id=clark.cucinell@patricbrc.org|token_type=Bearer|scope=user|roles=admin|SigningSubject=https://user.patricbrc.org/public_key|sig=2f47f26e58688f245da08353978f6f3e19c37b40f8a76f36b7190eccef1f6a48a44e7cde3a079d17b6fc75d34257346e5573c503ac237eb878eb0a539b34bf4f12b84b480d6d7cbc3f4b8f8946cf07bfe367c48fe11844f19f7e4bdaa4f2c685e5af21d7a06032c5b1b3de9b126a4d9545bf3c86c4a4c4ccce9752489b1ce3f3"
    
    try:
        # Make the POST request to the /chat-only endpoint
        response = requests.post(
            f"{base_url}/chat-only",
            json=payload,
            headers=headers,
            timeout=300  # 30 second timeout
        )
        
        # Raise an exception for bad status codes
        response.raise_for_status()
        
        # Parse and return the JSON response
        return response.json()
        
    except requests.exceptions.Timeout:
        return {
            "error": "Request timeout",
            "message": "The chat request timed out after 30 seconds"
        }
    except requests.exceptions.ConnectionError:
        return {
            "error": "Connection error", 
            "message": f"Failed to connect to {base_url}"
        }
    except requests.exceptions.HTTPError as e:
        return {
            "error": f"HTTP error {response.status_code}",
            "message": response.text if response else str(e)
        }
    except requests.exceptions.RequestException as e:
        return {
            "error": "Request failed",
            "message": str(e)
        }
    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON response",
            "message": "The server returned an invalid JSON response"
        }