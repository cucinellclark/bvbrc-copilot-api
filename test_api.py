import requests

# Define the API endpoint
url = 'http://localhost:8492/copilot/chat'

# Data to be sent to the API (JSON format)
data = {
    "query": "Hello, tell me about BV-BRC"
}

# Send POST request to the API
response = requests.post(url, json=data)

# Check if the request was successful
print(f'{response.status_code}')

# Print the response content (JSON from the API)
print("Response from API:", response.content)

