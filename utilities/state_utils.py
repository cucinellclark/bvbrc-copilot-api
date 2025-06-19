import os
from data_utils import query_solr_endpoint

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
    """
    # Remove the /view/ prefix
    if path.startswith('/view/'):
        remaining_path = path[6:]  # Remove '/view/'
        
        # Split by '/' and take the first segment (view type)
        # Also handle cases with query params (?) or fragments (#)
        view_type_segment = remaining_path.split('/')[0]
        
        # Remove any query parameters or fragments
        view_type = view_type_segment.split('?')[0].split('#')[0]

        if view_type == "Taxonomy":
            taxonomy_id = remaining_path.split('/')[1].split('#')[0].split('?')[0]
            state = query_solr_endpoint("taxonomy", "eq(taxon_id," + taxonomy_id + ")")
            return {"path": path, "status": "view", "view_type": "taxonomy", "state": state}
        elif view_type == "Genome":
            return {"path": path, "status": "view", "view_type": "genome"}
        elif view_type == "GenomeList":
            return {"path": path, "status": "view", "view_type": "genome_list"}
        elif view_type == "ProteinStructure":
            return {"path": path, "status": "view", "view_type": "protein_structure"}
        else:
            return {"path": path, "status": "view", "view_type": "unknown"}
        
    else:
        return {"path": path, "status": "view", "view_type": "unknown"}

