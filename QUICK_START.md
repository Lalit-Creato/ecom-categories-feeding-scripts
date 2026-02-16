# Quick Start Guide

## One-Time Setup

1. **Install dependencies:**
   ```bash
   uv sync
   ```

2. **Create `.env` file:**
   ```bash
   cat > .env << 'ENVEOF'
   OPENAI_API_KEY=your_actual_api_key_here
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USERNAME=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DATABASE=creato_db
   ENVEOF
   ```

## Running the Scripts (In Order)

### Step 1: Fill Categories
```bash
uv run python fill_categories.py
```

### Step 2: Generate Variant Options
```bash
uv run python seeding.py
```

### Step 3: Link Categories to Options
```bash
uv run python link_category_options.py
```

## That's it! 🎉

All scripts will output progress messages and confirm when complete.
