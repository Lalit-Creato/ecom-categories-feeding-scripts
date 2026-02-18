# NestJS E-commerce Seeding Service

This is a complete NestJS implementation that combines all Python scripts into a single TypeScript file.

## Files Created

1. **`ecom-seeding.complete.ts`** - Single file with everything (Service + Controller + Module)
2. **`ecom-seeding.service.ts`** - Service only (if you prefer separate files)
3. **`ecom-seeding.controller.ts`** - Controller only (if you prefer separate files)
4. **`ecom-seeding.module.ts`** - Module only (if you prefer separate files)

## Installation

### 1. Install Required Dependencies

```bash
npm install @nestjs/common @nestjs/core @nestjs/config pg openai uuid
npm install -D @types/pg @types/uuid
```

Or with yarn:
```bash
yarn add @nestjs/common @nestjs/core @nestjs/config pg openai uuid
yarn add -D @types/pg @types/uuid
```

### 2. Environment Variables

Make sure your `.env` file has:

```env
OPENAI_API_KEY=your_openai_api_key_here
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DATABASE=creato_db
CATEGORY_LIMIT=10  # Optional, defaults to 10
```

### 3. Import Module

In your `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { EcomSeedingModule } from './ecom-seeding.complete';

@Module({
  imports: [
    EcomSeedingModule,
    // ... other modules
  ],
})
export class AppModule {}
```

## Usage

### Option 1: HTTP Endpoints

Once the module is imported, you can use these HTTP endpoints:

#### 1. Fill Categories from JSON
```bash
POST http://localhost:3000/ecom-seeding/fill-categories
Content-Type: application/json

{
  "jsonFilePath": "path/to/amazon_browse_nodes_complete (1).json"  # Optional
}
```

#### 2. Generate Variant Options
```bash
POST http://localhost:3000/ecom-seeding/generate-options?limit=10
```

#### 3. Link Categories to Options
```bash
POST http://localhost:3000/ecom-seeding/link-options?limit=10
```

#### 4. Run All Steps
```bash
POST http://localhost:3000/ecom-seeding/run-all
Content-Type: application/json

{
  "jsonFilePath": "path/to/file.json",  # Optional
  "limit": 10  # Optional
}
```

### Option 2: Direct Service Injection

You can also inject the service directly in your code:

```typescript
import { Injectable } from '@nestjs/common';
import { EcomSeedingService } from './ecom-seeding.complete';

@Injectable()
export class YourService {
  constructor(private readonly seedingService: EcomSeedingService) {}

  async doSeeding() {
    // Step 1: Fill categories
    await this.seedingService.fillCategories();
    
    // Step 2: Generate options
    await this.seedingService.generateVariantOptions(10);
    
    // Step 3: Link options
    await this.seedingService.linkCategoryOptions(10);
  }
}
```

## API Methods

### `fillCategories(jsonFilePath?: string)`
- Reads JSON file and populates `ecom_categories` table
- Returns: `{ success: boolean, count: number, message: string }`

### `generateVariantOptions(limit?: number)`
- Generates product variant options using AI for categories
- Returns: `{ success: boolean, message: string }`

### `linkCategoryOptions(limit?: number)`
- Links categories to their suggested options
- Returns: `{ success: boolean, totalLinks: number, skippedLinks: number, message: string }`

## Features

✅ All three Python scripts combined into one NestJS service
✅ Type-safe TypeScript implementation
✅ HTTP endpoints for easy integration
✅ Direct service injection support
✅ Proper error handling and logging
✅ Database transactions for data integrity
✅ Environment variable configuration

## Notes

- The service uses connection pooling for PostgreSQL
- All operations are transactional (rollback on error)
- Logging is done via NestJS Logger
- The single file (`ecom-seeding.complete.ts`) contains everything you need

