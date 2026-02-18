# NestJS E-commerce Seeding

This folder contains all NestJS implementation files for the e-commerce data seeding.

## Files

- **`run-seeding.ts`** - Main script to run all seeding operations (use this one!)
- **`ecom-seeding.complete.ts`** - Complete module with service, controller, and module (for HTTP endpoints)
- **`ecom-seeding.service.ts`** - Service only
- **`ecom-seeding.controller.ts`** - Controller only  
- **`ecom-seeding.module.ts`** - Module only
- **`package.json`** - Node.js dependencies
- **`tsconfig.json`** - TypeScript configuration

## Quick Start

### 1. Install Dependencies

```bash
cd nestjs
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the **parent directory** (or copy from root):

```env
OPENAI_API_KEY=your_openai_api_key_here
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DATABASE=creato_db
CATEGORY_LIMIT=10
JSON_FILE_PATH=amazon_browse_nodes_complete (1).json
```

### 3. Run the Script

```bash
npx ts-node run-seeding.ts
```

## What It Does

The script automatically runs all three steps:

1. **Fill Categories** - Reads JSON file and populates `ecom_categories` table
2. **Generate Options** - Uses AI to generate variant options for categories  
3. **Link Options** - Links categories to their suggested options

## Alternative: HTTP Endpoints

If you want to use HTTP endpoints instead, import `EcomSeedingModule` from `ecom-seeding.complete.ts` in your NestJS app.

## Notes

- The `.env` file should be in the parent directory (same level as `nestjs` folder)
- The JSON file path is relative to where you run the script from
- All operations are transactional and will rollback on error

