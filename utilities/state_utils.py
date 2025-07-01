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
    elif path.startswith('/searches') or path.startswith('/search'):
        return search_path_state(path)
    elif path.startswith('/app'):
        return app_path_state(path)
    elif path.startswith('/workspace'):
        return workspace_path_state(path)
    elif path.startswith('/job'):
        return job_path_state(path)
    elif path.startswith('/outbreaks'):
        return outbreaks_path_state(path)
    elif path == '/' or path.startswith('/about') or path.startswith('/brc-calendar') or path.startswith('/publications') or path.startswith('/citation') or path.startswith('/related-resources') or path.startswith('/privacy-policy') or path.startswith('/team'):
        return about_path_state(path)
    else:
        return {"path": path, "status": "unknown"}

def view_path_state(path):
    """
    Parse the view type from a view path.
    Examples:
    - /view/Taxonomy/773#view_tab=overview -> type: "Taxonomy"
    - /view/Genome/1221525.3#... -> type: "Genome"
    - /view/GenomeList/?... -> type: "GenomeList"
    - /view/ProteinStructure#... -> type: "ProteinStructure"
    - /view/Antibiotic?eq(antibiotic_name,penicillin) -> type: "Antibiotic"
    - /view/Antibiotic/?eq(antibiotic_name,penicillin) -> type: "Antibiotic"
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
                return {"path": path, "status": "view", "type": "taxonomy", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "type": "taxonomy", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == "Genome":
            genome_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if genome_id:
                state = query_solr_endpoint("genome", "eq(genome_id," + genome_id + ")")
                return {"path": path, "status": "view", "type": "genome", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "type": "genome", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Feature':
            feature_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if feature_id:
                state = query_solr_endpoint("genome_feature", "eq(feature_id," + feature_id + ")")
                return {"path": path, "status": "view", "type": "feature", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "type": "feature", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Antibiotic':
            # Now check query_params instead of parsing from remaining_path
            if query_params.get('query') and query_params['query'].startswith('eq(antibiotic_name,') and query_params['query'].endswith(')'):
                antibiotic_name = query_params['query'][19:-1]
                state = query_solr_endpoint("antibiotics", "eq(antibiotic_name," + antibiotic_name + ")")
                return {"path": path, "status": "view", "type": "antibiotic", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "type": "antibiotic", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'Epitope':
            epitope_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if epitope_id:
                state = query_solr_endpoint("epitope", "eq(epitope_id," + epitope_id + ")")
                return {"path": path, "status": "view", "type": "epitope", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "type": "epitope", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == "ProteinStructure":
            # For ProteinStructure, we now check hashtag_params instead of the fragment in the path
            if hashtag_params.get('accession'):
                accession = hashtag_params['accession']
                state = query_solr_endpoint("protein_structure", "eq(pdb_id," + accession + ")")
                return {"path": path, "status": "view", "type": "protein_structure", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "type": "protein_structure", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwaySummary':
            return {"path": path, "status": "view", "type": "pathway_summary", "state": "This is the pathway summary view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'ExperimentComparison':
            experiment_id = remaining_path.split('/')[1] if '/' in remaining_path else ""
            if experiment_id:
                state = query_solr_endpoint("experiment", "eq( exp_id," + experiment_id + ")")
                return {"path": path, "status": "view", "type": "experiment_comparison", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "view", "type": "experiment_comparison", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'BiosetResult':
            # Now check query_params instead of parsing from remaining_path
            if query_params.get('query') and query_params['query'].startswith('in(exp_id,(') and query_params['query'].endswith('))'):
                exp_id = query_params['query'][11:-2]
                state = query_solr_endpoint("experiment", "eq(exp_id," + exp_id + ")")
                return {"path": path, "status": "view", "type": "bioset_result", "state": state, "hashtag_params": hashtag_params, "query_params": query_params}
            return {"path": path, "status": "view", "type": "bioset_result", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwayMap':
            return {"path": path, "status": "view", "type": "pathway_map", "state": "not implemented", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'GenomeList':
            return {"path": path, "status": "view", "type": "genome_list", "state": "This is the genome list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'FeatureList':
            return {"path": path, "status": "view", "type": "feature_list", "state": "This is the feature list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'PathwayList':
            return {"path": path, "status": "view", "type": "pathway_list", "state": "This is the pathway list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif view_type == 'SubsystemList':
            return {"path": path, "status": "view", "type": "subsystem_list", "state": "This is the subsystem list view. Use the interactive grid chat in the vertical green bar to interact with the data.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "view", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}
        
    else:
        return {"path": path, "status": "view", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def search_path_state(path):
    """
    Parse the search type from a search path.
    Examples:
    - /searches/TaxaSearch -> type: "taxa_search"
    - /searches/GenomeSearch -> type: "genome_search"
    - /searches/ProteinSearch#keyword=example -> type: "protein_search"
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
    
    # Remove the /searches/ prefix from clean path
    if clean_path.startswith('/searches/') or clean_path.startswith('/search/'):
        remaining_path = clean_path[10:]  # Remove '/searches/'
        
        # Remove trailing slash if present
        remaining_path = remaining_path.rstrip('/')
        
        # Get the search type
        search_type = remaining_path
        
        if search_type == "TaxaSearch":
            return {"path": path, "status": "search", "type": "taxa_search", "state": "This is the taxa search page. Users can search for taxonomic information and organisms.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "GenomeSearch":
            return {"path": path, "status": "search", "type": "genome_search", "state": "This is the genome search page. Users can search for genome information and sequences.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "StrainSearch":
            return {"path": path, "status": "search", "type": "strain_search", "state": "This is the strain search page. Users can search for bacterial strain information.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "GenomicFeatureSearch":
            return {"path": path, "status": "search", "type": "genomic_feature_search", "state": "This is the genomic feature search page. Users can search for genes, proteins, and other genomic features.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "ProteinSearch":
            return {"path": path, "status": "search", "type": "protein_search", "state": "This is the protein search page. Users can search for protein sequences and information.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "SpecialtyGeneSearch":
            return {"path": path, "status": "search", "type": "specialty_gene_search", "state": "This is the specialty gene search page. Users can search for specialty genes like virulence factors, antibiotic resistance genes, etc.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "DomainAndMotifSearch":
            return {"path": path, "status": "search", "type": "domain_motif_search", "state": "This is the domain and motif search page. Users can search for protein domains and motifs.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "EpitopeSearch":
            return {"path": path, "status": "search", "type": "epitope_search", "state": "This is the epitope search page. Users can search for epitopes and related information.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "ProteinStructureSearch":
            return {"path": path, "status": "search", "type": "protein_structure_search", "state": "This is the protein structure search page. Users can search for 3D protein structures and PDB entries.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "PathwaySearch":
            return {"path": path, "status": "search", "type": "pathway_search", "state": "This is the pathway search page. Users can search for metabolic pathways and biochemical processes.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "SubsystemSearch":
            return {"path": path, "status": "search", "type": "subsystem_search", "state": "This is the subsystem search page. Users can search for functional subsystems and gene clusters.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "SurveillanceSearch":
            return {"path": path, "status": "search", "type": "surveillance_search", "state": "This is the surveillance search page. Users can search for surveillance and epidemiological data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "SerologySearch":
            return {"path": path, "status": "search", "type": "serology_search", "state": "This is the serology search page. Users can search for serological data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif search_type == "SFVTSearch":
            return {"path": path, "status": "search", "type": "sfvt_search", "state": "This is the SFVT (Sequence Feature Variant Type) search page. Users can search for feature variants.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "search", "type": "search_results", "state": f"This is the search results page. It displays the results of the search query {query_section}.", "hashtag_params": hashtag_params, "query_params": query_params}
        
    else:
        return {"path": path, "status": "search", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def app_path_state(path):
    """
    Parse the app type from an app path.
    Examples:
    - /app/Assembly2 -> type: "assembly2"
    - /app/Annotation -> type: "annotation"
    - /app/ComprehensiveGenomeAnalysis -> type: "comprehensive_genome_analysis"
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
    
    # Remove the /app/ prefix from clean path
    if clean_path.startswith('/app/'):
        remaining_path = clean_path[5:]  # Remove '/app/'
        
        # Remove trailing slash if present
        remaining_path = remaining_path.rstrip('/')
        
        # Get the app type
        app_type = remaining_path
        
        if app_type == "Assembly2":
            return {"path": path, "status": "app", "type": "assembly", "state": "This is the Genome Assembly service. It allows single or multiple assemblers to be invoked to compare results. The service attempts to select the best assembly.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Annotation":
            return {"path": path, "status": "app", "type": "annotation", "state": "This is the Genome Annotation service. It provides annotation of genomic features using the RAST tool kit (RASTtk) for bacteria and VIGOR4 for viruses. The service accepts a FASTA formatted contig file and an annotation recipe based on taxonomy to provide an annotated genome.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "ComprehensiveGenomeAnalysis":
            return {"path": path, "status": "app", "type": "comprehensive_genome_analysis", "state": "This is the Comprehensive Genome Analysis service. It provides a streamlined analysis \"meta-service\" that accepts raw reads and performs a comprehensive analysis including assembly, annotation, identification of nearest neighbors, a basic comparative analysis that includes a subsystem summary, phylogenetic tree, and the features that distinguish the genome from its nearest neighbors.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Homology":
            return {"path": path, "status": "app", "type": "homology", "state": "This is the BLAST service. It uses BLAST (Basic Local Alignment Search Tool) to search against public or private genomes or other databases using DNA or protein sequence(s).", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "PrimerDesign":
            return {"path": path, "status": "app", "type": "primer_design", "state": "This is the Primer Design service. It utilizes Primer3 to design primers from a given input sequence under a variety of temperature, size, and concentration constraints.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "GenomeDistance":
            return {"path": path, "status": "app", "type": "genome_distance", "state": "This is the Similar Genome Finder service. It will find similar public genomes in BV-BRC or compute genome distance estimation using Mash/MinHash. It returns a set of genomes matching the specified similarity criteria.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "GenomeAlignment":
            return {"path": path, "status": "app", "type": "genome_alignment", "state": "This is the Genome Alignment (Mauve) service. The Whole Genome Alignment Service aligns genomes using progressiveMauve.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Variation":
            return {"path": path, "status": "app", "type": "variation", "state": "This is the Variation Analysis service. It can be used to identify and annotate sequence variations.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Tnseq":
            return {"path": path, "status": "app", "type": "tnseq", "state": "This is the Tn-Seq Analysis service. It facilitates determination of essential and conditionally essential regions in bacterial genomes from data generated from transposon insertion sequencing (Tn-Seq) experiments.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "PhylogeneticTree":
            return {"path": path, "status": "app", "type": "phylogenetic_tree", "state": "This is the Bacterial Genome Tree service. It enables construction of custom phylogenetic trees for user-selected genomes using codon tree method.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "ViralGenomeTree":
            return {"path": path, "status": "app", "type": "viral_genome_tree", "state": "This is the Viral Genome Tree service. It enables construction of whole genome alignment based phylogenetic trees for user-selected viral genomes.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "GeneTree":
            return {"path": path, "status": "app", "type": "gene_tree", "state": "This is the Gene / Protein Tree service. It enables construction of custom phylogenetic trees built from user-selected genes or proteins.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "CoreGenomeMLST":
            return {"path": path, "status": "app", "type": "core_genome_mlst", "state": "This is the Core Genome MLST service. It accepts genome groups and uses them to create and evaluate a core genome through MultiLocus Sequence Typing (MLST). The service uses a software tool called chewBBACA. The list of bacterial species this service supports are available at cgMLST.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "WholeGenomeSNPAnalysis":
            return {"path": path, "status": "app", "type": "whole_genome_snp_analysis", "state": "This is the Whole Genome SNP Analysis service. It accepts genome groups and identifies single nucleotide polymorphisms (SNPs) for tracking viral and bacterial pathogens during outbreaks. The software, kSNP4 will identify SNPs and estimate phylogenetic trees based on those SNPs.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "MSA":
            return {"path": path, "status": "app", "type": "msa", "state": "This is the Multiple Sequence Alignment (MSA) and Single Nucleotide Polymorphism (SNP) / Variation Analysis Service. It allows users to choose an alignment algorithm to align sequences selected from: a search result, a FASTA file saved to the workspace, or through simply cutting and pasting. The service can also be used for variation and SNP analysis with feature groups, FASTA files, aligned FASTA files, and user input FASTA records.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "MetaCATS":
            return {"path": path, "status": "app", "type": "metacats", "state": "This is the Metadata-driven Comparative Analysis Tool (Meta-CATS). Users can identify positions that significantly differ between user-defined groups of sequences, though biological biases due to covariation, codon biases, and differences in genotype, geography, time of isolation, or others may affect the robustness of the underlying statistical assumptions.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "SeqComparison":
            return {"path": path, "status": "app", "type": "proteome_comparison", "state": "This is the Proteome Comparison service. It performs protein sequence-based genome comparison using bidirectional BLASTP, allowing users to select genomes and compare them to reference genomes.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "ComparativeSystems":
            return {"path": path, "status": "app", "type": "comparative_systems", "state": "This is the Comparative Systems service. It allows comparison of protein families, pathways, and subsystems for user-selected genomes.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Docking":
            return {"path": path, "status": "app", "type": "docking", "state": "This is the Docking service. It computes a set of docking poses given a protein structure and set of small-molecule ligands.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "TaxonomicClassification":
            return {"path": path, "status": "app", "type": "taxonomic_classification", "state": "This is the Taxonomic Classification service. It computes taxonomic classification for read data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "MetagenomicBinning":
            return {"path": path, "status": "app", "type": "metagenomic_binning", "state": "This is the Metagenomic Binning service. It accepts either reads or contigs, and attempts to \"bin\" the data into a set of genomes. This service can be used to reconstruct bacterial and archael genomes from environmental samples.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "MetagenomicReadMapping":
            return {"path": path, "status": "app", "type": "metagenomic_read_mapping", "state": "This is the Metagenomic Read Mapping service. It uses KMA to align reads against antibiotic resistance genes from CARD and virulence factors from VFDB.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Rnaseq":
            return {"path": path, "status": "app", "type": "rnaseq", "state": "This is the RNA-Seq Analysis service. It provides services for aligning, assembling, and testing differential expression on RNA-Seq data.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "Expression":
            return {"path": path, "status": "app", "type": "expression", "state": "This is the Expression Import service. It facilitates upload of user-provided, pre-processed differential expression datasets generated by microarray, RNA-Seq, or proteomic technologies to the user's private workspace.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "FastqUtil":
            return {"path": path, "status": "app", "type": "fastq_util", "state": "This is the Fastq Utilities service. It provides capability for aligning, measuring base call quality, and trimming fastq read files.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "IDMapper":
            return {"path": path, "status": "app", "type": "id_mapper", "state": "This is the ID Mapper tool. It maps BV-BRC identifiers to those from other prominent external databases such as GenBank, RefSeq, EMBL, UniProt, KEGG, etc. Alternatively, it can map a list of external database identifiers to the corresponding BV-BRC features.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "ComprehensiveSARS2Analysis":
            return {"path": path, "status": "app", "type": "comprehensive_sars2_analysis", "state": "This is the SARS-CoV-2 Genome Analysis service. It provides a streamlined \"meta-service\" that accepts raw reads and performs genome assembly, annotation, and variation analysis.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "SARS2Wastewater":
            return {"path": path, "status": "app", "type": "sars2_wastewater", "state": "This is the SARS-CoV-2 Wastewater Analysis service. It assembles raw reads with the Sars One Codex pipeline and performs variant analysis with Freyja.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "SequenceSubmission":
            return {"path": path, "status": "app", "type": "sequence_submission", "state": "This is the Sequence Submission service. It allows user to validate and submit virus sequences to NCBI Genbank. User-provided metadata and FASTA sequences are validated against the Genbank data submission standards to identify any sequence errors before submission. Sequences are also annotated using the VIGOR4 and FLAN annotation tools for internal use by users. The service provides a validation report that should be reviewed by the user before submitting the sequences to Genbank.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "HASubtypeNumberingConversion":
            return {"path": path, "status": "app", "type": "ha_subtype_numbering_conversion", "state": "This is the HA Subtype Numbering Conversion service. It allows user to renumber Influenza HA sequences according to a cross-subtype numbering scheme proposed by Burke and Smith in Burke DF, Smith DJ.2014. A recommended numbering scheme for influenza A HA subtypes. PLoS One 9:e112302. Burke and Smith's numbering scheme uses analysis of known HA structures to identify amino acids that are structurally and functionally equivalent across all HA subtypes, using a numbering system based on the mature HA sequence.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "SubspeciesClassification":
            return {"path": path, "status": "app", "type": "subspecies_classification", "state": "This is the Subspecies Classification tool. It assigns the genotype/subtype of a virus, based on the genotype/subtype assignments maintained by the International Committee on Taxonomy of Viruses (ICTV). This tool infers the genotype/subtype for a query sequence from its position within a reference tree. The service uses the pplacer tool with a reference tree and reference alignment and includes the query sequence as input. Interpretation of the pplacer result is handled by Cladinator.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "TreeSort":
            return {"path": path, "status": "app", "type": "tree_sort", "state": "This is the TreeSort tool. It infers both recent and ancestral reassortment events along the branches of a phylogenetic tree of a fixed genomic segment. It uses a statistical hypothesis testing framework to identify branches where reassortment with other segments has occurred and reports these events.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif app_type == "ViralAssembly":
            return {"path": path, "status": "app", "type": "viral_assembly", "state": "This is the Viral Assembly service. It utilizes IRMA (Iterative Refinement Meta-Assembler) to assemble viral genomes. Users must select the virus genome for processing.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "app", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}
        
    else:
        return {"path": path, "status": "app", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def outbreaks_path_state(path):
    """
    Parse the outbreaks type from an outbreaks path.
    Examples:
    - /outbreaks/ -> type: "outbreaks"
    - /outbreaks/123 -> type: "outbreak"
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
    
    # Remove the /outbreaks/ prefix from clean path
    if clean_path.startswith('/outbreaks/'):
        remaining_path = clean_path[10:]  # Remove '/outbreaks/'
        
        # Remove trailing slash if present
        remaining_path = remaining_path.rstrip('/')
        
        # Get the outbreaks type
        outbreaks_type = remaining_path
        
        if outbreaks_type == "":
            return {"path": path, "status": "outbreaks", "type": "mea", "state": "This is the outbreaks page. It displays a list of outbreaks.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif outbreaks_type == "Measles":
            return {"path": path, "status": "outbreaks", "type": "measles", "state": "This is the Measles outbreak tracking page. Measles is a highly contagious viral disease that spreads through respiratory droplets, primarily affecting areas with low vaccination coverage. The page tracks current outbreaks including the recent Texas outbreak that has spread to multiple states, driven by low vaccination rates.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif outbreaks_type == "Mpox":
            return {"path": path, "status": "outbreaks", "type": "mpox", "state": "This is the Mpox (Monkeypox) outbreak tracking page. Monitors the global spread of MPXV with over 99,176 confirmed cases across 117 countries. Tracks both Clade I (more pathogenic, Central Africa) and Clade II.b (global outbreak since 2022) variants, including recent concerning spread of Clade I outside traditional geographic ranges.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif outbreaks_type == "H5N1":
            return {"path": path, "status": "outbreaks", "type": "h5n1", "state": "This is the H5N1 Avian Influenza outbreak tracking page. Monitors the ongoing H5N1 outbreak that began in 2020, spreading across continents through migrating birds. Tracks human infections (26 cases globally Jan 2022-April 2024), including recent dairy farm worker cases, and monitors viral evolution for mammalian adaptation markers.", "hashtag_params": hashtag_params, "query_params": query_params}
        elif outbreaks_type == "SARSCoV2":
            return {"path": path, "status": "outbreaks", "type": "sars_cov2", "state": "This is the SARS-CoV-2 Variants and Lineages of Concern tracking page. Provides real-time monitoring of COVID-19 variants through daily processing of sequences, risk assessment of emerging variants, and interactive dashboards showing variant prevalence across countries and regions over time.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "outbreaks", "type": "unknown", "state": "This is an outbreak page for an unknown outbreak type.", "hashtag_params": hashtag_params, "query_params": query_params}
    
    else:
        return {"path": path, "status": "outbreaks", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def workspace_path_state(path):
    """
    Parse the workspace type from a workspace path.
    Examples:
    - /workspace/clark.cucinell@patricbrc.org/home -> type: "workspace"
    - /workspace/public/ARWattam@patricbrc.org/BV-BRC Workshop -> type: "workspace"
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
    
    # Remove the /workspace/ prefix from clean path
    if clean_path.startswith('/workspace/'):
        remaining_path = clean_path[11:]  # Remove '/workspace/'
        
        # Remove trailing slash if present
        remaining_path = remaining_path.rstrip('/')
        
        # Parse workspace owner and path
        path_parts = remaining_path.split('/')
        if len(path_parts) >= 1:
            workspace_owner = path_parts[0]
            workspace_subpath = '/'.join(path_parts[1:]) if len(path_parts) > 1 else ""
            
            # Determine if it's a public or private workspace
            if workspace_owner == "public":
                return {"path": path, "status": "workspace", "type": "public_workspace", "owner": workspace_owner, "subpath": workspace_subpath, "state": "This is a public workspace that provides shared access to data, analysis results, and collaborative research materials. Public workspaces are accessible by any registered user and contain datasets and tools shared by the community.", "hashtag_params": hashtag_params, "query_params": query_params}
            else:
                return {"path": path, "status": "workspace", "type": "private_workspace", "owner": workspace_owner, "subpath": workspace_subpath, "state": "This is a private workspace that provides a private area for uploading data, running analysis services, storing analysis results, and managing groups of data. The workspace contains folders for experiments, genome groups, feature groups, and job results.", "hashtag_params": hashtag_params, "query_params": query_params}
        else:
            return {"path": path, "status": "workspace", "type": "workspace_root", "state": "This is the workspace root directory. Workspaces provide private areas for uploading data, running analysis services, and managing research data and results.", "hashtag_params": hashtag_params, "query_params": query_params}
    else:
        return {"path": path, "status": "workspace", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def job_path_state(path):
    """
    Parse the job type from a job path.
    Examples:
    - /job/ -> type: "job_status_page"
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
    
    # Handle both /job and /job/ paths
    if clean_path == '/job' or clean_path == '/job/':
        return {"path": path, "status": "job", "type": "job_status_page", "state": "This is the Job Status page that provides a list of all submitted jobs. It shows information including job status (queued, running, completed, or failed), submission time, service type, output name, start time, and completion time. Users can view job results, kill running jobs, or report issues with failed jobs. Jobs are created when analysis services run on back-end HPC systems.", "hashtag_params": hashtag_params, "query_params": query_params}
    else:
        return {"path": path, "status": "job", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}

def about_path_state(path):
    """
    Parse the about type from an about path.
    Examples:
    - /about/ -> type: "about"
    - / -> type: "home"
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
    
    # Handle both /about and / (root) paths
    if clean_path == '/about' or clean_path == '/about/':
        return {"path": path, "status": "about", "type": "about", "state": "This is the About BV-BRC page. The Bacterial and Viral Bioinformatics Resource Center (BV-BRC) is an information system designed to support the biomedical research community's work on bacterial and viral infectious diseases via integration of vital pathogen information with rich data and analysis tools. BV-BRC combines the data, technology, and extensive user communities from PATRIC (bacterial system) and IRD/ViPR (viral systems). It is led by Rick Stevens (University of Chicago) and Elliot Lefkowitz (University of Alabama at Birmingham), and is funded by the National Institute of Allergy and Infectious Diseases under Grant No. U24AI183849.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/' or clean_path == '':
        return {"path": path, "status": "home", "type": "home", "state": "This is the BV-BRC home page. BV-BRC (Bacterial and Viral Bioinformatics Resource Center) provides integrated access to bacterial and viral pathogen data, analysis tools, and resources. It combines PATRIC and IRD/ViPR databases with hundreds of thousands of bacterial genomes and over a million viral genomes, supporting comparative bioinformatics, large-scale data analysis, and machine learning for infectious disease research.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/brc-calendar' or clean_path == '/brc-calendar/':
        return {"path": path, "status": "about", "type": "brc_calendar", "state": "This is the BRC Calendar page. The calendar provides a consolidated view of events, such as webinars and workshops, across three BRCs: BV-BRC, BRC Analytics, and Pathogen Data Network. Users can view upcoming events, access additional details by clicking on events, and add events to their personal calendars. This centralized calendar helps the research community stay informed about educational opportunities and collaborative events across the broader BRC ecosystem.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/publications' or clean_path == '/publications/':
        return {"path": path, "status": "about", "type": "publications", "state": "This is the Publications page. Complete lists of publications by BV-BRC resource can be found at Google Scholar. This page provides access to scientific publications and research papers that have utilized BV-BRC resources, helping users discover relevant literature and understand how the platform has contributed to infectious disease research.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/citation' or clean_path == '/citation/':
        return {"path": path, "status": "about", "type": "citation", "state": "This is the Citing BV-BRC Resources page. It provides proper citation information for researchers using BV-BRC, PATRIC, IRD, or ViPR web resources in publications or proposals. The page includes specific citation formats for each resource, acknowledgment text for grant funding, and contact information (help@bv-brc.org) for notifying the team about accepted publications that cite BV-BRC resources.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/related-resources' or clean_path == '/related-resources/':
        return {"path": path, "status": "about", "type": "related_resources", "state": "This is the Related Resources page. It provides links to complementary bioinformatics resources including other Bioinformatics Resource Centers (BRC Analytics, Pathogen Data Network), NIAID programs, and external databases and tools relevant to infectious disease research. Resources include NCBI, GISAID, CDC, WHO, KBase, KEGG, and specialized databases like IEDB and ViralZone.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/privacy-policy' or clean_path == '/privacy-policy/':
        return {"path": path, "status": "about", "type": "privacy_policy", "state": "This is the Privacy Policy page. It describes how BV-BRC collects, stores, uses, and protects personal information and research data. The policy covers user account information, data sharing controls, usage analytics, and security measures. BV-BRC is committed to maintaining confidentiality and never collects information for commercial purposes. Users can control their data sharing and have access to edit or remove their personal information.", "hashtag_params": hashtag_params, "query_params": query_params}
    elif clean_path == '/team' or clean_path == '/team/':
        return {"path": path, "status": "about", "type": "team", "state": "This is the BV-BRC Team page listing the project team members across four partner organizations. The team includes members from the University of Chicago/Argonne National Laboratory/FIG (led by Co-Principal Investigator Rick Stevens), J. Craig Venter Institute (led by Site Principal Investigator Indresh Singh), Biocomplexity Institute and Initiative at University of Virginia, and University of Alabama at Birmingham (led by Co-Principal Investigator Elliot Lefkowitz). The page displays the collaborative structure and expertise that makes BV-BRC possible.", "hashtag_params": hashtag_params, "query_params": query_params}
    else:
        return {"path": path, "status": "about", "type": "unknown", "hashtag_params": hashtag_params, "query_params": query_params}