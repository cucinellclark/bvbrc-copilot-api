import json
import requests
import os
from typing import Optional, Dict, Any
from mongo_helper import get_rag_configs
from distllm.chat import distllm_chat
from tfidf_vectorizer.tfidf_vectorizer import tfidf_search

def load_config():
    """Load configuration from config.json file"""
    config_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Config file not found at {config_path}")
        return {}
    except json.JSONDecodeError:
        print(f"Invalid JSON in config file at {config_path}")
        return {}
    except Exception as e:
        print(f"Error loading config file: {e}")
        return {}

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
        if rag_db == 'bvbrc_default':
            return bvbrc_default_rag(query, rag_db, user_id, model, num_docs, session_id)
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
        elif program == 'tfidf':
            return tfidf_search_only(query, rag_db, user_id, model, num_docs, session_id, rag_config)
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
        model: Model name to use for chat
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
        text_list = tfidf_results['documents']
        tfidf_string = '\n\n'.join(text_list)
        distllm_results = distllm_rag(query, rag_db, user_id, model, num_docs, session_id, distllm_config, tfidf_string)
        documents = distllm_results['documents'] + text_list
        # Combine results from all RAG configurations
        combined_response = {
            'message': 'success',
            'documents': documents,
            'embedding': distllm_results['embedding']
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
            'documents': result.get('documents', []),
            'embedding': result.get('embedding', [])
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

        return {
            'message': 'success',
            'documents': text_list,
            'embedding': None
        }
        
    except Exception as e:
        print(f"Error in tfidf_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process TF-IDF search',
            'program': 'tfidf',
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
    
    # Add authentication header from config
    config = load_config()
    auth_token = config.get('authorization_token', '')
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    else:
        print("Warning: No authorization token found in config file")
    
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

def bvbrc_default_rag(query, rag_db, user_id, model, num_docs, session_id):
    """
    Handle the default BVBRC RAG request by combining results from bvbrc_helpdesk 
    (using multi_rag_handler) and cepi_journals (using distllm_rag).
    
    Args:
        query: User query string
        rag_db: RAG database name (should be 'bvbrc_default')
        user_id: User identifier
        model: Model name to use
        num_docs: Number of documents to retrieve
        session_id: Session identifier
        
    Returns:
        Dict containing the combined response with documents and embedding
    """
    try:
        print(f"BVBRC Default RAG: Processing query for rag_db '{rag_db}'")
        
        # Get RAG configurations for both databases
        bvbrc_helpdesk_configs = get_rag_configs('bvbrc_helpdesk')
        cepi_journals_configs = get_rag_configs('cepi_journals')
        
        if not bvbrc_helpdesk_configs or len(bvbrc_helpdesk_configs) == 0:
            raise ValueError("No RAG configurations found for 'bvbrc_helpdesk'")
        
        if not cepi_journals_configs or len(cepi_journals_configs) == 0:
            raise ValueError("No RAG configurations found for 'cepi_journals'")
        
        # Run bvbrc_helpdesk with multi_rag_handler
        print("Running bvbrc_helpdesk with multi_rag_handler...")
        bvbrc_helpdesk_result = multi_rag_handler(
            query, 'bvbrc_helpdesk', user_id, model, num_docs, session_id, bvbrc_helpdesk_configs
        )
        
        # Check if bvbrc_helpdesk_result has an error
        if 'error' in bvbrc_helpdesk_result:
            print(f"Error in bvbrc_helpdesk: {bvbrc_helpdesk_result['error']}")
            bvbrc_documents = []
        else:
            bvbrc_documents = bvbrc_helpdesk_result.get('documents', [])
        
        # Run cepi_journals with distllm_rag (using the first configuration)
        print("Running cepi_journals with distllm_rag...")
        cepi_config = cepi_journals_configs[0]
        cepi_result = distllm_rag(
            query, 'cepi_journals', user_id, model, num_docs, session_id, cepi_config
        )
        
        # Check if cepi_result has an error
        if 'error' in cepi_result:
            print(f"Error in cepi_journals: {cepi_result['error']}")
            cepi_documents = []
            cepi_embedding = []
        else:
            cepi_documents = cepi_result.get('documents', [])
            cepi_embedding = cepi_result.get('embedding', [])
        
        # Combine documents from both sources
        combined_documents = bvbrc_documents + cepi_documents
        
        # Return the combined result using the embedding from cepi_journals
        return {
            'message': 'success',
            'documents': combined_documents,
            'embedding': cepi_embedding
        }
        
    except Exception as e:
        print(f"Error in bvbrc_default_rag: {e}")
        return {
            'error': str(e),
            'message': 'Failed to process BVBRC default RAG request',
            'rag_db': rag_db,
            'program': 'bvbrc_default'
        }