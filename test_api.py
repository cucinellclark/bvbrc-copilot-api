import requests

# Define the API endpoint
url = 'https://p3cp.theseed.org/copilot-api/copilot-chat'
#url = 'https://p3cp.theseed.org/copilot-api/argo/chat'

# Data to be sent to the API (JSON format)
data = {
    "query": "Hello, tell me about BV-BRC",
    "user_id": "clark.cucinell",
    "session_id": "abcdefg"
}

# Send POST request to the API
response = requests.post(url, json=data, verify=False)

# Check if the request was successful
print(f'{response.status_code}')

# Print the response content (JSON from the API)
print("Response from API:", response.content)

