import requests

base_url = "https://www.bv-brc.org/api/"
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def query_solr_endpoint(endpoint, params):
    """
    Query the Solr endpoint with the given parameters.
    """
    query_url = base_url + endpoint + '?' + params
    print('query_url', query_url)
    response = requests.get(query_url, headers=headers)
    if response.status_code == 200:
        res = response.json()
        print('res', res)
        return res
    else:
        print('Error querying Solr endpoint:', response.status_code, response.text)
        return None
