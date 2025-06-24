import tiktoken

def create_query_from_messages(query, messages, system_prompt, max_tokens):
    """
    Create a query from messages while staying under the max token limit.
    
    Args:
        query: The current user query/question
        messages: List of message dictionaries with 'role' and 'content' keys (conversation history)
        system_prompt: System prompt string to include at the beginning
        max_tokens: Maximum number of tokens allowed in the query
    
    Returns:
        String containing the formatted query
    """

    max_tokens = 40000

    # Use the cl100k_base encoding (used by GPT-4-turbo and GPT-3.5-turbo)
    encoding = tiktoken.get_encoding("cl100k_base")
    
    # Calculate token count including system prompt (for calculation) and query
    system_part = f"System: {system_prompt}\n\n" if system_prompt else ""
    query_section = f"Current Query: {query}\n\n"
    
    # Calculate tokens for system prompt + final query
    base_content = system_part + query_section
    base_tokens = len(encoding.encode(base_content))
    remaining_tokens = max_tokens - base_tokens
    
    # If we don't have enough tokens even for the basic structure, return minimal version
    if remaining_tokens <= 0:
        return f"Current Query: {query}"
    
    # Process messages from first to last (conversation history)
    conversation_parts = []
    for message in messages:
        role = message.get('role', 'user')
        content = message.get('content', '')
        
        # Format the message based on role
        if role == 'system':
            # Skip system messages since we handle system_prompt separately
            continue
        elif role == 'assistant':
            formatted_message = f"Assistant: {content}\n\n"
        else:  # user or any other role defaults to user
            formatted_message = f"User: {content}\n\n"
        
        # Check if adding this message would exceed remaining tokens
        test_conversation = "".join(conversation_parts) + formatted_message
        test_tokens = len(encoding.encode(test_conversation))
        
        if test_tokens <= remaining_tokens:
            # Safe to add this message
            conversation_parts.append(formatted_message)
        else:
            # Adding this message would exceed limit, stop here
            break
    
    # Build final query WITHOUT system prompt but with conversation history and current query
    final_parts = []
    
    if conversation_parts:
        final_parts.append("Conversation History:\n")
        final_parts.extend(conversation_parts)
        final_parts.append("\n")
    
    final_parts.append(f"Current Query: {query}")
    
    # Join all parts and return
    final_query = "".join(final_parts).strip()
    return final_query 