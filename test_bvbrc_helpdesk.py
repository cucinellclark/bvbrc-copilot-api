import requests
import json

# Flask server URL - adjust port if needed
FLASK_URL = "http://ash.cels.anl.gov:5000/rag"  # Changed to rag endpoint

# Sample request data for RAG testing
data = {
    "query": "how do I submit a genome assembly",
    "rag_db": "bvbrc_helpdesk",  # The database we've been debugging
    "user_id": "test_user",
    "model": "test_model", 
    "num_docs": 5,
    "session_id": "test_session"
}

print(f"Testing RAG endpoint: {FLASK_URL}")
print(f"Request data: {json.dumps(data, indent=2)}")
print("-" * 50)

# Send a POST request to the Flask API
try:
    response = requests.post(FLASK_URL, json=data, timeout=30)
    
    # Print the response
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("Success!")
        print(f"Response: {json.dumps(result, indent=2)}")
        
        # Print summary info if available
        if 'documents' in result:
            print(f"\nFound {len(result['documents'])} documents")
        if 'embedding' in result:
            print(f"Embedding length: {len(result['embedding']) if result['embedding'] else 'None'}")
            
    else:
        print("Error:")
        print(f"Response text: {response.text}")
        
        # Try to parse as JSON for better formatting
        try:
            error_json = response.json()
            print(f"Error JSON: {json.dumps(error_json, indent=2)}")
        except:
            pass
            
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
