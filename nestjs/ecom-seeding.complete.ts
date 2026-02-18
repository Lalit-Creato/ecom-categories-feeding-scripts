/**
 * Complete E-commerce Seeding Service - All-in-One NestJS File
 * 
 * This file contains all functionality from:
 * - fill_categories.py
 * - seeding.py
 * - link_category_options.py
 * 
 * Usage:
 * 1. Import EcomSeedingModule in your main AppModule
 * 2. Use the HTTP endpoints or inject EcomSeedingService directly
 */

import { Module, Injectable, Controller, Post, Body, Query, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// INTERFACES
// ============================================

interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  is_active: boolean;
  updated_at: Date;
}

interface Option {
  id: string;
  code: string;
  name: string;
}

// ============================================
// SERVICE
// ============================================

@Injectable()
export class EcomSeedingService {
  private readonly logger = new Logger(EcomSeedingService.name);
  private pool: Pool;
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    // Initialize PostgreSQL connection pool
    this.pool = new Pool({
      host: this.configService.get<string>('POSTGRES_HOST', 'localhost'),
      port: this.configService.get<number>('POSTGRES_PORT', 5432),
      database: this.configService.get<string>('POSTGRES_DATABASE', 'creato_db'),
      user: this.configService.get<string>('POSTGRES_USERNAME', 'postgres'),
      password: this.configService.get<string>('POSTGRES_PASSWORD', 'postgres'),
    });

    // Initialize OpenAI client
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.openai = new OpenAI({ apiKey });
  }

  // ============================================
  // 1. FILL CATEGORIES FROM JSON FILE
  // ============================================

  private generateSlug(name: string): string {
    let slug = name.toLowerCase();
    slug = slug.replace(/[^\w\s-]/g, '');
    slug = slug.replace(/[-\s]+/g, '-');
    slug = slug.trim().replace(/^-+|-+$/g, '');
    return slug;
  }

  private parseCategories(
    data: any,
    parentId: string | null = null,
    slugTracker: Map<string, number> = new Map(),
  ): Category[] {
    const categories: Category[] = [];

    if (data.id === 'root') {
      if (data.childNodes && Array.isArray(data.childNodes)) {
        for (const child of data.childNodes) {
          categories.push(...this.parseCategories(child, null, slugTracker));
        }
      }
      return categories;
    }

    const categoryId = uuidv4();
    const name = data.name || '';
    const baseSlug = this.generateSlug(name);

    const parentKey = `${parentId || 'root'}-${baseSlug}`;
    let slug = baseSlug;
    if (slugTracker.has(parentKey)) {
      const count = slugTracker.get(parentKey)! + 1;
      slugTracker.set(parentKey, count);
      slug = `${baseSlug}-${count}`;
    } else {
      slugTracker.set(parentKey, 1);
    }

    const category: Category = {
      id: categoryId,
      parent_id: parentId,
      name,
      slug,
      is_active: true,
      updated_at: new Date(),
    };

    categories.push(category);

    if (data.childNodes && Array.isArray(data.childNodes)) {
      for (const child of data.childNodes) {
        categories.push(...this.parseCategories(child, categoryId, slugTracker));
      }
    }

    return categories;
  }

  private async insertCategories(categories: Category[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Use parameterized queries for safety
      for (const cat of categories) {
        await client.query(
          `
          INSERT INTO ecom_categories (id, parent_id, name, slug, is_active, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at
        `,
          [cat.id, cat.parent_id, cat.name, cat.slug, cat.is_active, cat.updated_at],
        );
      }

      await client.query('COMMIT');
      this.logger.log(`✅ Successfully inserted ${categories.length} categories`);
      return categories.length;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Error inserting categories: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  async fillCategories(jsonFilePath?: string): Promise<{ success: boolean; count: number; message: string }> {
    try {
      const filePath = jsonFilePath || path.join(process.cwd(), 'amazon_browse_nodes_complete (1).json');
      
      this.logger.log(`📖 Reading categories from ${filePath}...`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File '${filePath}' not found`);
      }

      const fileStats = fs.statSync(filePath);
      this.logger.log(`📊 File size: ${fileStats.size.toLocaleString()} bytes`);

      if (fileStats.size === 0) {
        throw new Error(`File '${filePath}' is empty`);
      }

      const encodings = ['utf8', 'utf-8', 'latin1'];
      let data: any = null;
      let lastError: Error | null = null;

      for (const encoding of encodings) {
        try {
          const content = fs.readFileSync(filePath, encoding);
          if (!content.trim()) {
            throw new Error('File appears to be empty after reading');
          }
          data = JSON.parse(content);
          this.logger.log(`✅ Successfully loaded JSON data using ${encoding} encoding`);
          break;
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }

      if (!data) {
        throw new Error(`Failed to parse JSON: ${lastError?.message}`);
      }

      this.logger.log('🔄 Parsing category hierarchy...');
      const categories = this.parseCategories(data);
      this.logger.log(`✅ Parsed ${categories.length} categories from hierarchy`);

      this.logger.log('🔌 Connecting to PostgreSQL...');
      const count = await this.insertCategories(categories);
      this.logger.log(`✅ Done! Inserted/updated ${count} categories`);

      return {
        success: true,
        count,
        message: `Successfully inserted/updated ${count} categories`,
      };
    } catch (error) {
      this.logger.error(`❌ Error: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // 2. GENERATE VARIANT OPTIONS USING AI
  // ============================================

  private async getCategories(limit: number = 10): Promise<Array<{ id: string; name: string; description: string | null }>> {
    const result = await this.pool.query(
      `SELECT id, name, description FROM ecom_categories WHERE is_active = true LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  private async generateVariantsFromAI(categoryName: string, categoryDescription: string | null): Promise<any> {
    const prompt = `
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
{
  "options": [
    {
      "code": "snake_case",
      "name": "Human Readable",
      "values": ["value1", "value2"]
    }
  ]
}

Category:
Name: ${categoryName}
Description: ${categoryDescription || 'No description available'}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;

      return JSON.parse(jsonContent);
    } catch (error) {
      this.logger.error(`❌ Error parsing AI response: ${error.message}`);
      throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
    }
  }

  private async getOrCreateOption(code: string, name: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT id FROM ecom_options WHERE code = $1', [code]);
      
      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }

      const optionId = uuidv4();
      const now = new Date();
      await client.query(
        `INSERT INTO ecom_options (id, code, name, description, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, $5, $6)`,
        [optionId, code, name, `${name} option`, now, now],
      );

      return optionId;
    } finally {
      client.release();
    }
  }

  private async insertOptionValues(optionId: string, values: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      for (let position = 0; position < values.length; position++) {
        const value = values[position];
        
        const existing = await client.query(
          'SELECT 1 FROM ecom_option_values WHERE option_id = $1 AND value = $2',
          [optionId, value],
        );

        if (existing.rows.length > 0) {
          continue;
        }

        const valueId = uuidv4();
        await client.query(
          `INSERT INTO ecom_option_values (id, option_id, value, position) VALUES ($1, $2, $3, $4)`,
          [valueId, optionId, value, position + 1],
        );
      }
    } finally {
      client.release();
    }
  }

  async generateVariantOptions(limit: number = 10): Promise<{ success: boolean; message: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const categoryLimit = parseInt(process.env.CATEGORY_LIMIT || limit.toString(), 10);
      const categories = await this.getCategories(categoryLimit);

      for (const category of categories) {
        this.logger.log(`🤖 Generating variants for: ${category.name}`);

        const aiData = await this.generateVariantsFromAI(category.name, category.description);

        if (aiData.options && Array.isArray(aiData.options)) {
          for (const opt of aiData.options) {
            const optionId = await this.getOrCreateOption(opt.code, opt.name);
            await this.insertOptionValues(optionId, opt.values || []);
          }
        }
      }

      await client.query('COMMIT');
      this.logger.log('🎉 AI-based variant generation completed');

      return {
        success: true,
        message: 'AI-based variant generation completed',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Error: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // 3. LINK CATEGORIES TO OPTIONS
  // ============================================

  private async getAllOptions(): Promise<Option[]> {
    const result = await this.pool.query(
      `SELECT id, code, name FROM ecom_options WHERE is_active = true ORDER BY name`,
    );
    return result.rows;
  }

  private async generateOptionSuggestionsFromAI(
    categoryName: string,
    categoryDescription: string | null,
    availableOptions: Option[],
  ): Promise<any> {
    const optionsList = availableOptions.map((opt) => `- ${opt.name} (code: ${opt.code})`).join('\n');
    const optionsText = optionsList || 'No options available yet.';

    const prompt = `
You are an e-commerce domain expert.

Given a product category and a list of available product variant options, 
determine which options are relevant and should be suggested for this category.

Rules:
- Only suggest options that make sense for the category
- Be selective - not all options apply to every category
- Consider the category's typical products
- Return ONLY valid JSON, no markdown, no code blocks, just raw JSON

Output format:
{
  "suggested_option_codes": ["option_code1", "option_code2", "option_code3"]
}

Category:
Name: ${categoryName}
Description: ${categoryDescription || 'No description available'}

Available Options:
${optionsText}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '{}';
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;

      return JSON.parse(jsonContent);
    } catch (error) {
      this.logger.error(`❌ Error parsing AI response: ${error.message}`);
      throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
    }
  }

  private async linkCategoryToOption(categoryId: string, optionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const existing = await client.query(
        `SELECT 1 FROM ecom_category_option_suggestions WHERE category_id = $1 AND option_id = $2`,
        [categoryId, optionId],
      );

      if (existing.rows.length > 0) {
        return false;
      }

      await client.query(
        `INSERT INTO ecom_category_option_suggestions (category_id, option_id) VALUES ($1, $2)`,
        [categoryId, optionId],
      );

      return true;
    } finally {
      client.release();
    }
  }

  async linkCategoryOptions(limit: number = 10): Promise<{ success: boolean; totalLinks: number; skippedLinks: number; message: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      this.logger.log('📋 Fetching categories...');
      const categories = await this.getCategories(limit);
      this.logger.log(`✅ Found ${categories.length} categories`);

      if (categories.length === 0) {
        throw new Error('No categories found. Please run fillCategories first.');
      }

      this.logger.log('📋 Fetching available options...');
      const availableOptions = await this.getAllOptions();
      this.logger.log(`✅ Found ${availableOptions.length} options`);

      if (availableOptions.length === 0) {
        throw new Error('No options found. Please run generateVariantOptions first.');
      }

      const optionCodeToId = new Map<string, string>();
      for (const opt of availableOptions) {
        optionCodeToId.set(opt.code, opt.id);
      }

      let totalLinks = 0;
      let skippedLinks = 0;

      for (const category of categories) {
        this.logger.log(`🔗 Processing category: ${category.name}`);

        try {
          const aiData = await this.generateOptionSuggestionsFromAI(
            category.name,
            category.description,
            availableOptions,
          );

          const suggestedCodes = aiData.suggested_option_codes || [];

          if (suggestedCodes.length === 0) {
            this.logger.warn(`   ⚠️  No options suggested for this category`);
            continue;
          }

          this.logger.log(`   💡 AI suggested ${suggestedCodes.length} options`);

          let linkedCount = 0;
          for (const code of suggestedCodes) {
            const optionId = optionCodeToId.get(code);

            if (!optionId) {
              this.logger.warn(`   ⚠️  Option code '${code}' not found in database, skipping`);
              continue;
            }

            if (await this.linkCategoryToOption(category.id, optionId)) {
              linkedCount++;
              totalLinks++;
              this.logger.log(`   ✅ Linked to option: ${code}`);
            } else {
              skippedLinks++;
              this.logger.log(`   ⏭️  Already linked to option: ${code}`);
            }
          }

          this.logger.log(`   📊 Created ${linkedCount} new links for this category`);
        } catch (error) {
          this.logger.error(`   ❌ Error processing category '${category.name}': ${error.message}`);
          continue;
        }
      }

      await client.query('COMMIT');
      this.logger.log('🎉 Category-option linking completed!');
      this.logger.log(`   ✅ Created ${totalLinks} new links`);
      this.logger.log(`   ⏭️  Skipped ${skippedLinks} existing links`);

      return {
        success: true,
        totalLinks,
        skippedLinks,
        message: `Created ${totalLinks} new links, skipped ${skippedLinks} existing links`,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Error: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

// ============================================
// CONTROLLER
// ============================================

@Controller('ecom-seeding')
export class EcomSeedingController {
  constructor(private readonly seedingService: EcomSeedingService) {}

  @Post('fill-categories')
  async fillCategories(@Body() body?: { jsonFilePath?: string }) {
    return await this.seedingService.fillCategories(body?.jsonFilePath);
  }

  @Post('generate-options')
  async generateOptions(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.seedingService.generateVariantOptions(limitNum);
  }

  @Post('link-options')
  async linkOptions(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.seedingService.linkCategoryOptions(limitNum);
  }

  @Post('run-all')
  async runAll(@Body() body?: { jsonFilePath?: string; limit?: number }) {
    const results = {
      fillCategories: null,
      generateOptions: null,
      linkOptions: null,
    };

    try {
      results.fillCategories = await this.seedingService.fillCategories(body?.jsonFilePath);
      const limit = body?.limit || 10;
      results.generateOptions = await this.seedingService.generateVariantOptions(limit);
      results.linkOptions = await this.seedingService.linkCategoryOptions(limit);

      return {
        success: true,
        message: 'All seeding steps completed successfully',
        results,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        results,
      };
    }
  }
}

// ============================================
// MODULE
// ============================================

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [EcomSeedingController],
  providers: [EcomSeedingService],
  exports: [EcomSeedingService],
})
export class EcomSeedingModule {}

