import os
from pathlib import Path
from distllm.chat import distllm_chat

def test_distllm_chat():
    """Simple test function to call distllm_chat with test data."""
    
    # Create a temporary directory for saving conversations
    tmp_path = Path("/home/ac.cucinell/bvbrc-dev/Copilot/test_distllm_output")

    '''
    "server": "lambda13.cels.anl.gov",  # Example server
    "port": 9993,         # Example port
    "api_key": "AskClark",    # Example API key
    "model": "Salesforce/SFR-Embedding-Mistral"
    '''
    
    # Prepare test data that matches the ChatAppConfig structure
    test_data = {
        "rag_configs": {
            "generator_config": {
                "server": "rbdgx2",  
                "port": 9999,         
                "api_key": "CELS",    
                "model": "meta-llama/Llama-3.3-70B-Instruct"
            },
            "retriever_config": {
                'faiss_config': {
                    'name': 'faiss_index_v2',
                    'dataset_dir': '/home/ac.cucinell/bvbrc-dev/Copilot/CopilotUtilitiesDatabase/corpora/bvbrc_docs_distllm/docs_data/',
                    'faiss_index_path': '/home/ac.cucinell/bvbrc-dev/Copilot/CopilotUtilitiesDatabase/corpora/bvbrc_docs_distllm/faiss_index/bvbrc/faiss_index',
                    'dataset_chunk_paths': None,    
                    'precision': 'float32',
                    'search_algorithm': 'exact',
                    'rescore_multiplier': 2,
                    'num_quantization_workers': 1
                },
                'encoder_config': {
                    'name': 'auto',
                    'pretrained_model_name_or_path': 'Salesforce/SFR-Embedding-Mistral'
                }
            },
            "verbose": True
        },
        "save_conversation_path": str(tmp_path)
    }
    
    # Call the function
    result = distllm_chat("What is the BV-BRC?", test_data)
    
    print(f"Result: {result}")
    return result

if __name__ == "__main__":
    test_distllm_chat()
