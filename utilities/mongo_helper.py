import json
import os
from typing import Optional, Dict, Any
try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure, PyMongoError
except ImportError:
    raise ImportError("pymongo is required. Install it with: pip install pymongo")


class MongoDBHelper:
    """Helper class for MongoDB operations related to RAG configuration."""
    
    def __init__(self, config_path: str = "mongodb_config.json"):
        """Initialize MongoDB connection using config file.
        
        Args:
            config_path: Path to the config.json file containing MongoDB URL
        """
        self.config_path = config_path
        self.client = None
        self.db = None
        self._load_config()
        self._connect()
    
    def _load_config(self):
        """Load configuration from config.json file."""
        try:
            # Try to load from current directory first, then utilities directory
            config_paths = [
                self.config_path,
                os.path.join(os.path.dirname(__file__), "..", self.config_path),
                os.path.join(os.path.dirname(__file__), self.config_path)
            ]
            
            for path in config_paths:
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        self.config = json.load(f)
                    return
                    
            raise FileNotFoundError(f"Config file not found in any of: {config_paths}")
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in config file: {e}")
        except Exception as e:
            raise Exception(f"Error loading config: {e}")
    
    def _connect(self):
        """Establish connection to MongoDB."""
        try:
            mongo_url = self.config.get('mongoDBUrl')
            if not mongo_url:
                raise ValueError("mongoDBUrl not found in config")
            
            self.client = MongoClient(mongo_url)
            # Test the connection
            self.client.admin.command('ping')
            self.db = self.client['copilot']  # Using same database as in database.js
            print("Connected to MongoDB successfully")
            
        except ConnectionFailure as e:
            raise ConnectionFailure(f"Failed to connect to MongoDB: {e}")
        except Exception as e:
            raise Exception(f"Error establishing MongoDB connection: {e}")
    
    def get_rag_config_by_name(self, rag_db_name: str) -> Optional[Dict[str, Any]]:
        """Get RAG configuration by database name.
        
        Args:
            rag_db_name: Name of the RAG database to look up
            
        Returns:
            Dictionary containing RAG configuration or None if not found
        """
        try:
            if self.db is None:
                raise Exception("Database connection not established")
            
            rag_collection = self.db['ragList']
            result = rag_collection.find_one({'name': rag_db_name})

            if result:
                # Convert ObjectId to string for JSON serialization
                if '_id' in result:
                    result['_id'] = str(result['_id'])
                    
            return result
            
        except PyMongoError as e:
            raise Exception(f"Database query error: {e}")
        except Exception as e:
            raise Exception(f"Error getting RAG config: {e}")
    
    def get_active_rag_configs(self) -> list:
        """Get all active RAG configurations.
        
        Returns:
            List of active RAG configurations sorted by priority
        """
        try:
            if self.db is None:
                raise Exception("Database connection not established")
            
            rag_collection = self.db['ragList']
            results = list(rag_collection.find({'active': True}).sort('priority', 1))
            
            # Convert ObjectIds to strings
            for result in results:
                if '_id' in result:
                    result['_id'] = str(result['_id'])
                    
            return results
            
        except PyMongoError as e:
            raise Exception(f"Database query error: {e}")
        except Exception as e:
            raise Exception(f"Error getting active RAG configs: {e}")

    def get_rag_configs(self, rag_db_name: str) -> list:
        """Get all RAG configurations for a specific database name.
        
        Args:
            rag_db_name: Name of the RAG database

        Returns:
            List of RAG configurations
        """
        try:
            if self.db is None:
                raise Exception("Database connection not established")
            rag_collection = self.db['ragList']
            results = list(rag_collection.find({'name': rag_db_name}))

            if results:
                # Convert ObjectIds to strings
                for result in results:
                    if '_id' in result:
                        result['_id'] = str(result['_id'])

            return results
            
        except PyMongoError as e:
            raise Exception(f"Database query error: {e}")
        except Exception as e:
            raise Exception(f"Error getting RAG configs: {e}")
    
    def close(self):
        """Close the MongoDB connection."""
        if self.client:
            self.client.close()
            print("MongoDB connection closed")


# Convenience functions for direct use
def get_mongo_helper() -> MongoDBHelper:
    """Get a MongoDB helper instance."""
    return MongoDBHelper()

def get_rag_config(rag_db_name: str) -> Optional[Dict[str, Any]]:
    """Get RAG configuration for a specific database name.
    
    Args:
        rag_db_name: Name of the RAG database
        
    Returns:
        Dictionary containing RAG configuration or None if not found
    """
    helper = MongoDBHelper()
    try:
        return helper.get_rag_config_by_name(rag_db_name)
    finally:
        helper.close()

def get_rag_configs(rag_db_name: str) -> list:
    """Get all RAG configurations for a specific database name.
    
    Args:
        rag_db_name: Name of the RAG database

    Returns:
        List of RAG configurations
    """
    helper = MongoDBHelper()
    try:
        return helper.get_rag_configs(rag_db_name)
    finally:
        helper.close() 

def get_active_rag_configs() -> list:
    """Get all active RAG configurations.
    
    Returns:
        List of active RAG configurations
    """
    helper = MongoDBHelper()
    try:
        return helper.get_active_rag_configs()
    finally:
        helper.close() 
