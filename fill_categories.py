#!/usr/bin/env python3
"""
Script to populate ecom_categories table from test.txt JSON file.
Reads hierarchical category structure and inserts into PostgreSQL.
"""

import json
import uuid
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, timezone
import re
import sys
import os
from typing import Dict, Optional, List, Tuple

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, skip loading .env file


def generate_slug(name: str) -> str:
    """Generate URL-friendly slug from category name."""
    # Convert to lowercase
    slug = name.lower()
    # Replace spaces and special characters with hyphens
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    return slug


def parse_categories(
    data: dict, parent_id: Optional[str] = None, slug_tracker: Optional[Dict[tuple, int]] = None
) -> List[Tuple[str, Optional[str], str, str, bool, datetime]]:
    """
    Recursively parse category tree and return list of category tuples.
    
    Args:
        data: Category data from JSON
        parent_id: Parent category ID (as string)
        slug_tracker: Dictionary to track slug usage per parent: {(parent_id, base_slug): count}
    
    Returns: List of (id, parent_id, name, slug, is_active, updated_at) tuples
    Note: UUIDs are returned as strings for psycopg2 compatibility
    """
    if slug_tracker is None:
        slug_tracker = {}
    
    categories = []
    
    # Skip root node
    if data.get('id') == 'root':
        if 'childNodes' in data:
            for child in data['childNodes']:
                categories.extend(parse_categories(child, None, slug_tracker))
        return categories
    
    # Generate UUID for this category (as string for psycopg2)
    category_id = str(uuid.uuid4())
    name = data.get('name', '')
    base_slug = generate_slug(name)
    
    # Ensure unique slug within parent by tracking usage
    parent_key = (parent_id if parent_id else 'root', base_slug)
    if parent_key in slug_tracker:
        slug_tracker[parent_key] += 1
        slug = f"{base_slug}-{slug_tracker[parent_key]}"
    else:
        slug_tracker[parent_key] = 1  # Start at 1, so first duplicate will be -2
        slug = base_slug
    
    is_active = True
    updated_at = datetime.now(timezone.utc)
    
    # Add this category (UUIDs as strings)
    categories.append((category_id, parent_id, name, slug, is_active, updated_at))
    
    # Process child nodes
    if 'childNodes' in data and data['childNodes']:
        for child in data['childNodes']:
            categories.extend(parse_categories(child, category_id, slug_tracker))
    
    return categories


def insert_categories(
    connection, categories: List[Tuple[str, Optional[str], str, str, bool, datetime]]
):
    """Insert categories into PostgreSQL database."""
    cursor = connection.cursor()
    
    # Prepare insert query
    insert_query = """
        INSERT INTO ecom_categories (id, parent_id, name, slug, is_active, updated_at)
        VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at;
    """
    
    try:
        # Use execute_values for batch insert
        execute_values(
            cursor,
            insert_query,
            categories,
            template=None,
            page_size=1000
        )
        connection.commit()
        print(f"✅ Successfully inserted {len(categories)} categories")
        return len(categories)
    except Exception as e:
        connection.rollback()
        print(f"❌ Error inserting categories: {e}")
        raise
    finally:
        cursor.close()


def main():
    """Main function to read JSON and populate database."""
    # Database connection parameters
    # Uses environment variables matching your .env file
    db_config = {
        'host': os.getenv('POSTGRES_HOST', 'localhost'),
        'database': os.getenv('POSTGRES_DATABASE', 'creato_db'),
        'user': os.getenv('POSTGRES_USERNAME', 'postgres'),
        'password': os.getenv('POSTGRES_PASSWORD', 'postgres'),
        'port': int(os.getenv('POSTGRES_PORT', '5432'))
    }
    
    # Read JSON file
    json_file = 'amazon_browse_nodes_complete (1).json'
    
    print(f"📖 Reading categories from {json_file}...")
    try:
        # Check if file exists and get its size
        if not os.path.exists(json_file):
            print(f"❌ Error: File '{json_file}' not found")
            sys.exit(1)
        
        file_size = os.path.getsize(json_file)
        print(f"📊 File size: {file_size:,} bytes")
        
        if file_size == 0:
            print(f"❌ Error: File '{json_file}' is empty")
            sys.exit(1)
        
        # Try reading with UTF-8, and if that fails, try with UTF-8-sig (handles BOM)
        encodings = ['utf-8-sig', 'utf-8', 'latin-1']
        data = None
        last_error = None
        
        for encoding in encodings:
            try:
                with open(json_file, 'r', encoding=encoding) as f:
                    content = f.read()
                    if not content.strip():
                        raise ValueError("File appears to be empty after reading")
                    data = json.loads(content)
                    print(f"✅ Successfully loaded JSON data using {encoding} encoding")
                    break
            except (UnicodeDecodeError, json.JSONDecodeError) as e:
                last_error = e
                continue
        
        if data is None:
            print(f"❌ Error parsing JSON: {last_error}")
            print(f"💡 Tried encodings: {', '.join(encodings)}")
            # Show first 200 characters for debugging
            try:
                with open(json_file, 'rb') as f:
                    first_bytes = f.read(200)
                    print(f"📄 First 200 bytes (hex): {first_bytes.hex()}")
                    print(f"📄 First 200 bytes (text): {first_bytes[:200]}")
            except:
                pass
            sys.exit(1)
            
    except FileNotFoundError:
        print(f"❌ Error: File '{json_file}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error reading file: {e}")
        sys.exit(1)
    
    # Parse categories
    print("🔄 Parsing category hierarchy...")
    categories = parse_categories(data)
    print(f"✅ Parsed {len(categories)} categories from hierarchy")
    
    # Connect to database
    print("🔌 Connecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(**db_config)
        print("✅ Connected to database")
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
        print("\n💡 Make sure to update database credentials in the script")
        sys.exit(1)
    
    # Insert categories
    print("💾 Inserting categories into database...")
    try:
        count = insert_categories(conn, categories)
        print(f"✅ Done! Inserted/updated {count} categories")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    finally:
        conn.close()
        print("🔌 Database connection closed")


if __name__ == '__main__':
    main()

