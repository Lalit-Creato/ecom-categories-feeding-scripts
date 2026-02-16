#!/usr/bin/env python3
"""
Script to populate ecom_category_option_suggestions table.
Links categories to their suggested product variant options.
"""

import psycopg2
import uuid
import json
import re
import os
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# Load environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is required")

client = OpenAI(api_key=OPENAI_API_KEY)

DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DATABASE", "creato_db"),
    "user": os.getenv("POSTGRES_USERNAME", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432"))
}


def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def get_categories(conn, limit=10):
    """Get active categories from the database."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, description
            FROM ecom_categories
            WHERE is_active = true
            ORDER BY name
            LIMIT %s
        """, (limit,))
        return cur.fetchall()


def get_all_options(conn):
    """Get all available options from the database."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, code, name
            FROM ecom_options
            WHERE is_active = true
            ORDER BY name
        """)
        return cur.fetchall()


def generate_option_suggestions_from_ai(category_name, category_description, available_options):
    """Use AI to suggest which options are relevant for a category."""
    
    # Format available options for the prompt
    options_list = []
    for opt_id, code, name in available_options:
        options_list.append(f"- {name} (code: {code})")
    
    options_text = "\n".join(options_list) if options_list else "No options available yet."
    
    prompt = f"""
You are an e-commerce domain expert.

Given a product category and a list of available product variant options, 
determine which options are relevant and should be suggested for this category.

Rules:
- Only suggest options that make sense for the category
- Be selective - not all options apply to every category
- Consider the category's typical products
- Return ONLY valid JSON, no markdown, no code blocks, just raw JSON

Output format:
{{
  "suggested_option_codes": ["option_code1", "option_code2", "option_code3"]
}}

Category:
Name: {category_name}
Description: {category_description or "No description available"}

Available Options:
{options_text}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"}
    )

    content = response.choices[0].message.content
    
    # Try to extract JSON from markdown code blocks if present
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
    if json_match:
        content = json_match.group(1)
    
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing JSON response:")
        print(f"Response content: {content[:500]}")
        raise ValueError(f"Failed to parse AI response as JSON: {e}")


def get_option_id_by_code(conn, code):
    """Get option ID by code."""
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM ecom_options WHERE code = %s", (code,))
        row = cur.fetchone()
        return row[0] if row else None


def link_category_to_option(conn, category_id, option_id):
    """Link a category to an option in ecom_category_option_suggestions."""
    with conn.cursor() as cur:
        # Check if link already exists
        cur.execute("""
            SELECT 1 FROM ecom_category_option_suggestions
            WHERE category_id = %s AND option_id = %s
        """, (category_id, option_id))
        
        if cur.fetchone():
            return False  # Link already exists
        
        # Insert the link
        cur.execute("""
            INSERT INTO ecom_category_option_suggestions (category_id, option_id)
            VALUES (%s, %s)
        """, (category_id, option_id))
        
        return True  # Link created


def process_category_options():
    """Main function to link categories to their suggested options."""
    conn = get_connection()
    try:
        # Get categories (top 10 by default)
        print("📋 Fetching categories...")
        categories = get_categories(conn, limit=10)
        print(f"✅ Found {len(categories)} categories")
        
        if not categories:
            print("⚠️  No categories found. Please run fill_categories.py first.")
            return
        
        # Get all available options
        print("📋 Fetching available options...")
        available_options = get_all_options(conn)
        print(f"✅ Found {len(available_options)} options")
        
        if not available_options:
            print("⚠️  No options found. Please run seeding.py first to generate options.")
            return
        
        # Create a mapping of option codes to IDs for quick lookup
        option_code_to_id = {}
        for opt_id, code, name in available_options:
            option_code_to_id[code] = opt_id
        
        total_links = 0
        skipped_links = 0
        
        # Process each category
        for category_id, name, description in categories:
            print(f"\n🔗 Processing category: {name}")
            
            try:
                # Get AI suggestions for this category
                ai_data = generate_option_suggestions_from_ai(
                    name, 
                    description, 
                    available_options
                )
                
                suggested_codes = ai_data.get("suggested_option_codes", [])
                
                if not suggested_codes:
                    print(f"   ⚠️  No options suggested for this category")
                    continue
                
                print(f"   💡 AI suggested {len(suggested_codes)} options")
                
                # Link each suggested option to the category
                linked_count = 0
                for code in suggested_codes:
                    option_id = option_code_to_id.get(code)
                    
                    if not option_id:
                        print(f"   ⚠️  Option code '{code}' not found in database, skipping")
                        continue
                    
                    # Link category to option
                    if link_category_to_option(conn, category_id, option_id):
                        linked_count += 1
                        total_links += 1
                        print(f"   ✅ Linked to option: {code}")
                    else:
                        skipped_links += 1
                        print(f"   ⏭️  Already linked to option: {code}")
                
                print(f"   📊 Created {linked_count} new links for this category")
                
            except Exception as e:
                print(f"   ❌ Error processing category '{name}': {e}")
                continue
        
        # Commit all changes
        conn.commit()
        print(f"\n🎉 Category-option linking completed!")
        print(f"   ✅ Created {total_links} new links")
        print(f"   ⏭️  Skipped {skipped_links} existing links")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        raise e
    finally:
        conn.close()


if __name__ == "__main__":
    process_category_options()

