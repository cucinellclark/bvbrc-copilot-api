import tiktoken

def count_tokens(text_list):
    # Use the cl100k_base encoding (used by GPT-4-turbo and GPT-3.5-turbo)
    encoding = tiktoken.get_encoding("cl100k_base")
    
    # Initialize list to store token counts
    token_counts = []
    
    # Iterate through each text and count tokens
    for text in text_list:
        tokens = encoding.encode(text)
        token_counts.append(len(tokens))
        
    return token_counts

