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


def get_categories(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, description
            FROM ecom_categories
            WHERE is_active = true
            LIMIT 10
        """)
        return cur.fetchall()


def generate_variants_from_ai(category_name, category_description):
    prompt = f"""
You are an e-commerce domain expert.

Given a product category, generate all realistic product variant options
used in modern e-commerce platforms.

Rules:
- Variants must be relevant to the category
- Do NOT invent impossible variants
- Keep options reusable across products
- Values must be strings
- Return ONLY valid JSON, no markdown, no code blocks, just raw JSON

Output format:
{{
  "options": [
    {{
      "code": "snake_case",
      "name": "Human Readable",
      "values": ["value1", "value2"]
    }}
  ]
}}

Category:
Name: {category_name}
Description: {category_description}
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


def get_or_create_option(conn, code, name):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM ecom_options WHERE code = %s", (code,))
        row = cur.fetchone()

        if row:
            return row[0]

        option_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO ecom_options (id, code, name, description, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, true, %s, %s)
        """, (
            option_id,
            code,
            name,
            f"{name} option",
            datetime.utcnow(),
            datetime.utcnow()
        ))
        return option_id


def insert_option_values(conn, option_id, values):
    with conn.cursor() as cur:
        for position, value in enumerate(values, start=1):
            cur.execute("""
                SELECT 1 FROM ecom_option_values
                WHERE option_id = %s AND value = %s
            """, (option_id, value))

            if cur.fetchone():
                continue

            cur.execute("""
                INSERT INTO ecom_option_values (id, option_id, value, position)
                VALUES (%s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                option_id,
                value,
                position
            ))


def process_categories():
    conn = get_connection()
    try:
        categories = get_categories(conn)

        for category_id, name, description in categories:
            print(f"🤖 Generating variants for: {name}")

            ai_data = generate_variants_from_ai(name, description)

            for opt in ai_data["options"]:
                option_id = get_or_create_option(
                    conn,
                    opt["code"],
                    opt["name"]
                )
                insert_option_values(conn, option_id, opt["values"])

        conn.commit()
        print("🎉 AI-based variant generation completed")

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


if __name__ == "__main__":
    process_categories()
