# Run NestJS Seeding Script

## Single File Execution

The file `run-seeding.ts` is a standalone script that runs all seeding operations automatically.

## Prerequisites

1. **Install Node.js dependencies:**
   ```bash
   npm install @nestjs/common @nestjs/core @nestjs/config pg openai uuid
   npm install -D @types/pg @types/uuid typescript ts-node @nestjs/cli
   ```

2. **Create `.env` file** (same as Python scripts):
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USERNAME=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DATABASE=creato_db
   CATEGORY_LIMIT=10  # Optional, defaults to 10
   JSON_FILE_PATH=amazon_browse_nodes_complete (1).json  # Optional
   ```

## Run the Script

### Option 1: Using ts-node (Recommended)
```bash
npx ts-node run-seeding.ts
```

### Option 2: Using NestJS CLI
```bash
nest start --entryFile run-seeding
```

### Option 3: Compile and Run
```bash
# Compile TypeScript
npx tsc run-seeding.ts

# Run the compiled JavaScript
node run-seeding.js
```

## What It Does

The script automatically runs all three steps in sequence:

1. **Fill Categories** - Reads JSON file and populates `ecom_categories` table
2. **Generate Options** - Uses AI to generate variant options for categories
3. **Link Options** - Links categories to their suggested options

## Output

You'll see progress logs for each step:
```
🚀 Starting E-commerce Seeding Script...
==========================================

📦 STEP 1: Filling Categories from JSON
==========================================
📖 Reading categories from...
✅ Successfully inserted X categories

🤖 STEP 2: Generating Variant Options
==========================================
🤖 Generating variants for: Category Name
🎉 AI-based variant generation completed

🔗 STEP 3: Linking Categories to Options
==========================================
🔗 Processing category: Category Name
✅ Created X new links

✅ All seeding operations completed successfully!
```

## Environment Variables

- `CATEGORY_LIMIT` - Number of categories to process (default: 10)
- `JSON_FILE_PATH` - Path to JSON file (default: `amazon_browse_nodes_complete (1).json` in current directory)

## That's It!

Just run the file and everything happens automatically - no HTTP endpoints needed!

