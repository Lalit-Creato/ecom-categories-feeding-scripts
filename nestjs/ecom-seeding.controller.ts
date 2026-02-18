import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { EcomSeedingService } from './ecom-seeding.service';

@Controller('ecom-seeding')
export class EcomSeedingController {
  constructor(private readonly seedingService: EcomSeedingService) {}

  /**
   * Fill categories from JSON file
   * POST /ecom-seeding/fill-categories
   * Optional body: { "jsonFilePath": "path/to/file.json" }
   */
  @Post('fill-categories')
  async fillCategories(@Body() body?: { jsonFilePath?: string }) {
    return await this.seedingService.fillCategories(body?.jsonFilePath);
  }

  /**
   * Generate variant options using AI
   * POST /ecom-seeding/generate-options
   * Optional query: ?limit=10
   */
  @Post('generate-options')
  async generateOptions(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.seedingService.generateVariantOptions(limitNum);
  }

  /**
   * Link categories to options
   * POST /ecom-seeding/link-options
   * Optional query: ?limit=10
   */
  @Post('link-options')
  async linkOptions(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return await this.seedingService.linkCategoryOptions(limitNum);
  }

  /**
   * Run all seeding steps in sequence
   * POST /ecom-seeding/run-all
   * Optional body: { "jsonFilePath": "path/to/file.json", "limit": 10 }
   */
  @Post('run-all')
  async runAll(@Body() body?: { jsonFilePath?: string; limit?: number }) {
    const results = {
      fillCategories: null,
      generateOptions: null,
      linkOptions: null,
    };

    try {
      // Step 1: Fill categories
      results.fillCategories = await this.seedingService.fillCategories(body?.jsonFilePath);

      // Step 2: Generate options
      const limit = body?.limit || 10;
      results.generateOptions = await this.seedingService.generateVariantOptions(limit);

      // Step 3: Link options
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

