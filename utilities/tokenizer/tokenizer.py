import tiktoken

def count_tokens(text):
    print(text)
    # Use the cl100k_base encoding (used by GPT-4-turbo and GPT-3.5-turbo)
    encoding = tiktoken.get_encoding("cl100k_base")
    
    # Encode the text and count the number of tokens
    tokens = encoding.encode(text)
    return len(tokens)

