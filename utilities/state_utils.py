import os
from data_utils import query_solr_endpoint

def process_hashtag_section(hashtag_section):
    """
    Process the hashtag section of a URL and return parsed parameters.
    Examples:
    - "view_tab=proteins" -> {"view_tab": "proteins"}
    - "view_tab=overview&filter=active" -> {"view_tab": "overview", "filter": "active"}
    - "accession=1ABC" -> {"accession": "1ABC"}
    """
    if not hashtag_section:
        return {}
    
    params = {}
    # Split by & to handle multiple parameters
    param_pairs = hashtag_section.split('&')
    
    for pair in param_pairs:
        if '=' in pair:
            key, value = pair.split('=', 1)
            params[key] = value
        else:
            # Handle cases where there's no = (treat as a flag)
            params[pair] = True
    
    return params

def process_query_section(query_section):
    """
    Process the query section of a URL and return parsed parameters.
    Examples:
    - "eq(antibiotic_name,penicillin)" -> {"query": "eq(antibiotic_name,penicillin)"}
    - "keyword=test&filter=active" -> {"keyword": "test", "filter": "active"}
    - "in(exp_id,(123))" -> {"query": "in(exp_id,(123))"}
    """
    if not query_section:
        return {}
    
    params = {}
    
    # Check if it's a complex query (starts with function-like syntax)
    if ('(' in query_section and ')' in query_section and 
        not '=' in query_section.split('(')[0]):
        # This looks like a complex query function, store as is
        params['query'] = query_section
    else:
        # Split by & to handle multiple parameters
        param_pairs = query_section.split('&')
        
        for pair in param_pairs:
            if '=' in pair:
                key, value = pair.split('=', 1)
                params[key] = value
            else:
                # Handle cases where there's no = (treat as a flag or complex query)
                if '(' in pair and ')' in pair:
                    params['query'] = pair
                else:
                    params[pair] = True
    
    return params

def get_path_state(path):
    """
    Placeholder function for get_path_state.
    """
    if path.startswith('/view'):
        return view_path_state(path)
    elif path.startswith('/searches'):
        return {"path": path, "status": "searches"}
    elif path.startswith('/app'):
        return {"path": path, "status": "app"}
    elif path.startswith('/workspace'):
        return {"path": path, "status": "workspace"}
    elif path.startswith('/job'):
        return {"path": path, "status": "job"}
    elif path.startswith('/outbreaks'):
        return {"path": path, "status": "outbreaks"}
    else:
        return {"path": path, "status": "unknown"}

def view_path_state(path):
    """
    Parse the view type from a view path.
    Examples:
    - /view/Taxonomy/773#view_tab=overview -> view_type: "Taxonomy"
    - /view/Genome/1221525.3#... -> view_type: "Genome"
    - /view/GenomeList/?... -> view_type: "GenomeList"
    - /view/ProteinStructure#... -> view_type: "ProteinStructure"
    - /view/Antibiotic?eq(antibiotic_name,penicillin) -> view_type: "Antibiotic"
    - /view/Antibiotic/?eq(antibiotic_name,penicillin) -> view_type: "Antibiotic"
    """
    # Extract hashtag section first
    hashtag_section = ""
    clean_path = path
    if '#' in path:
        clean_path, hashtag_section = path.split('#', 1)
    
    # Extract query section from clean_path
    query_section = ""
    if '?' in clean_path:
        clean_path, query_section = clean_path.split('?', 1)
    
    # Process hashtag and query parameters
    hashtag_params = process_hashtag_section(hashtag_section)
    query_params = process_query_section(query_section)
    
    # Remove the /view/ prefix from clean path
    if clean_path.startswith('/view/'):
        remaining_path = clean_path[6:]  # Remove '/view/'
        
        # Remove trailing slash if present
        remaining_path = remaining_path.rstrip('/')
        
        # Split by '/' and take the first segment (view type)
        view_type_segment = remaining_path.split('/')[0] if remaining_path else ""
        view_type = view_type_segment
        
        if view_type == "Taxonomy":
            taxonomy_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if taxonomy_id:
                state = query_solr_endpoint("taxonomy", "eq(taxon_id," + taxonomy_id + ")")
                return {"path": path, "status": "view", "view_type": "taxonomy", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "view_type": "taxonomy", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == "Genome":
            genome_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if genome_id:
                state = query_solr_endpoint("genome", "eq(genome_id," + genome_id + ")")
                return {"path": path, "status": "view", "view_type": "genome", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "view_type": "genome", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Feature':
            feature_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if feature_id:
                state = query_solr_endpoint("genome_feature", "eq(feature_id," + feature_id + ")")
                return {"path": path, "status": "view", "view_type": "feature", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "view_type": "feature", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Antibiotic':
            # Now check query_params instead of parsing from remaining_path
            if query_params.get('query') and query_params['query'].startswith('eq(antibiotic_name,') and query_params['query'].endswith(')'):
                antibiotic_name = query_params['query'][19:-1]
                state = query_solr_endpoint("antibiotics", "eq(antibiotic_name," + antibiotic_name + ")")
                return {"path": path, "status": "view", "view_type": "antibiotic", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "view_type": "antibiotic", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Epitope':
            epitope_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if epitope_id:
                state = query_solr_endpoint("epitope", "eq(epitope_id," + epitope_id + ")")
                return {"path": path, "status": "view", "view_type": "epitope", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "view_type": "epitope", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == "ProteinStructure":
            # For ProteinStructure, we now check hashtag_params instead of the fragment in the path
            if hashtag_params.get('accession'):
                accession = hashtag_params['accession']
                state = query_solr_endpoint("protein_structure", "eq(pdb_id," + accession + ")")
                return {"path": path, "status": "view", "view_type": "protein_structure", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "view_type": "protein_structure", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwaySummary':
            return {"path": path, "status": "view", "view_type": "pathway_summary", "state": "This is the pathway summary view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'ExperimentComparison':
            experiment_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if experiment_id:
                state = query_solr_endpoint("experiment", "eq( exp_id," + experiment_id + ")")
                return {"path": path, "status": "view", "view_type": "experiment_comparison", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "view_type": "experiment_comparison", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'BiosetResult':
            # Now check query_params instead of parsing from remaining_path
            if query_params.get('query') and query_params['query'].startswith('in(exp_id,(') and query_params['query'].endswith('))'):
                exp_id = query_params['query'][11:-2]
                state = query_solr_endpoint("experiment", "eq(exp_id," + exp_id + ")")
                return {"path": path, "status": "view", "view_type": "bioset_result", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "view_type": "bioset_result", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwayMap':
            return {"path": path, "status": "view", "view_type": "pathway_map", "state": "not implemented", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'GenomeList':
            return {"path": path, "status": "view", "view_type": "genome_list", "state": "This is the genome list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'FeatureList':
            return {"path": path, "status": "view", "view_type": "feature_list", "state": "This is the feature list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwayList':
            return {"path": path, "status": "view", "view_type": "pathway_list", "state": "This is the pathway list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'SubsystemList':
            return {"path": path, "status": "view", "view_type": "subsystem_list", "state": "This is the subsystem list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "view", "view_type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}
        
    else:
        return {"path": path, "status": "view", "view_type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

