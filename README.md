# E-commerce Data Seeding Scripts

This repository contains scripts to seed e-commerce data into a PostgreSQL database.

## Prerequisites

1. **Python 3.12+** installed
2. **PostgreSQL** database running
3. **OpenAI API Key** (for AI-based variant generation)
4. **uv** package manager (or use pip/venv)

## Setup Instructions

### 1. Install Dependencies

Using `uv` (recommended):
```bash
uv sync
```

Or using `pip`:
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cat > .env << 'EOF'
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# PostgreSQL Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DATABASE=creato_db
EOF
```

**Important:** Replace `your_openai_api_key_here` with your actual OpenAI API key.

### 3. Verify Database Connection

Make sure your PostgreSQL database is running and accessible with the credentials in your `.env` file.

## Scripts Overview

### 1. `fill_categories.py`
Populates the `ecom_categories` table from the Amazon browse nodes JSON file.

**What it does:**
- Reads `amazon_browse_nodes_complete (1).json`
- Parses hierarchical category structure
- Inserts categories into PostgreSQL with proper parent-child relationships
- Generates URL-friendly slugs for each category

### 2. `seeding.py`
Generates product variant options using AI for the top 10 active categories.

**What it does:**
- Fetches top 10 active categories from the database
- Uses OpenAI to generate realistic product variant options for each category
- Creates options and option values in `ecom_options` and `ecom_option_values` tables

## Running the Scripts

### Step 1: Populate Categories

First, populate the categories table from the JSON file:

```bash
# Using uv
uv run python fill_categories.py

# Or using python directly (if dependencies are installed)
python fill_categories.py
```

**Expected Output:**
```
📖 Reading categories from amazon_browse_nodes_complete (1).json...
📊 File size: XXX bytes
✅ Successfully loaded JSON data using utf-8 encoding
🔄 Parsing category hierarchy...
✅ Parsed XXX categories from hierarchy
🔌 Connecting to PostgreSQL...
✅ Connected to database
💾 Inserting categories into database...
✅ Successfully inserted XXX categories
✅ Done! Inserted/updated XXX categories
🔌 Database connection closed
```

### Step 2: Generate Variant Options

After categories are populated, generate variant options for the top 10 categories:

```bash
# Using uv
uv run python seeding.py

# Or using python directly
python seeding.py
```

**Expected Output:**
```
🤖 Generating variants for: Clothing & Accessories
🤖 Generating variants for: Electronics
...
🎉 AI-based variant generation completed
```

## Troubleshooting

### Database Connection Errors

If you get connection errors:
1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Check your `.env` file has correct credentials
3. Ensure the database `creato_db` exists

### OpenAI API Errors

If you get API errors:
1. Verify your `OPENAI_API_KEY` in `.env` is correct
2. Check your OpenAI account has credits/quota
3. Ensure you have internet connectivity

### JSON File Not Found

If `fill_categories.py` can't find the JSON file:
- Ensure `amazon_browse_nodes_complete (1).json` is in the project root directory
- Check file permissions

### Import Errors

If you get import errors:
- Make sure all dependencies are installed: `uv sync` or `pip install -r requirements.txt`
- Verify you're using the correct Python version (3.12+)

## Database Schema

The scripts expect the following tables:

- `ecom_categories` - Stores category hierarchy
- `ecom_options` - Stores product variant options (e.g., Size, Color)
- `ecom_option_values` - Stores values for each option (e.g., Small, Medium, Large)

## Notes

- The `seeding.py` script processes only the **top 10 categories** (LIMIT 10)
- Categories must have `is_active = true` to be processed
- The AI generates realistic variant options based on category name and description
- All operations are transactional - if an error occurs, changes are rolled back

