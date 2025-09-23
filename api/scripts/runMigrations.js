#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationRunner {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../migrations');
    this.migrationsTable = 'migration_history';
  }

  async init() {
    // Create migrations tracking table if it doesn't exist
    const { error } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
          id SERIAL PRIMARY KEY,
          migration_name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          execution_time_ms INTEGER,
          status VARCHAR(20) DEFAULT 'completed'
        );

        CREATE INDEX IF NOT EXISTS idx_migration_history_name
        ON ${this.migrationsTable} (migration_name);
      `
    });

    if (error) {
      console.error('Failed to initialize migration tracking:', error);
      throw error;
    }

    console.log('✅ Migration tracking initialized');
  }

  async getExecutedMigrations() {
    const { data, error } = await supabaseAdmin
      .from(this.migrationsTable)
      .select('migration_name')
      .eq('status', 'completed');

    if (error) {
      console.error('Failed to get executed migrations:', error);
      return [];
    }

    return data.map(row => row.migration_name);
  }

  async getPendingMigrations() {
    try {
      const migrationFiles = await fs.readdir(this.migrationsPath);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();

      const executed = await this.getExecutedMigrations();
      const pending = sqlFiles.filter(file => !executed.includes(file));

      return pending;
    } catch (error) {
      console.error('Failed to read migrations directory:', error);
      return [];
    }
  }

  async executeMigration(migrationFile) {
    const startTime = Date.now();
    const migrationPath = path.join(this.migrationsPath, migrationFile);

    try {
      console.log(`🔄 Executing migration: ${migrationFile}`);

      const sqlContent = await fs.readFile(migrationPath, 'utf8');

      // Split SQL file into individual statements
      const statements = sqlContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt && !stmt.startsWith('--'))
        .filter(stmt => stmt.length > 0);

      let executedStatements = 0;

      for (const statement of statements) {
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql: statement
        });

        if (error) {
          throw new Error(`SQL execution failed: ${error.message}\nStatement: ${statement}`);
        }
        executedStatements++;
      }

      const executionTime = Date.now() - startTime;

      // Record successful migration
      const { error: recordError } = await supabaseAdmin
        .from(this.migrationsTable)
        .insert({
          migration_name: migrationFile,
          execution_time_ms: executionTime,
          status: 'completed'
        });

      if (recordError) {
        console.warn('Migration executed but failed to record:', recordError);
      }

      console.log(`✅ Migration ${migrationFile} completed in ${executionTime}ms (${executedStatements} statements)`);

      return { success: true, executionTime, statements: executedStatements };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Record failed migration
      await supabaseAdmin
        .from(this.migrationsTable)
        .insert({
          migration_name: migrationFile,
          execution_time_ms: executionTime,
          status: 'failed'
        });

      console.error(`❌ Migration ${migrationFile} failed:`, error.message);
      throw error;
    }
  }

  async runMigrations() {
    try {
      await this.init();

      const pending = await this.getPendingMigrations();

      if (pending.length === 0) {
        console.log('📋 No pending migrations found');
        return { executed: 0, skipped: 0 };
      }

      console.log(`📋 Found ${pending.length} pending migration(s)`);

      let executed = 0;
      let failed = 0;

      for (const migration of pending) {
        try {
          await this.executeMigration(migration);
          executed++;
        } catch (error) {
          failed++;
          if (process.env.MIGRATION_CONTINUE_ON_ERROR !== 'true') {
            throw error;
          }
        }
      }

      console.log(`\n🎉 Migration summary:`);
      console.log(`   ✅ Executed: ${executed}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   📊 Total: ${executed + failed}`);

      return { executed, failed };

    } catch (error) {
      console.error('💥 Migration runner failed:', error.message);
      process.exit(1);
    }
  }

  async rollback(migrationName) {
    // Simple rollback by removing from history
    // Note: This doesn't undo the actual changes
    try {
      const { error } = await supabaseAdmin
        .from(this.migrationsTable)
        .delete()
        .eq('migration_name', migrationName);

      if (error) {
        throw error;
      }

      console.log(`🔄 Rolled back migration record: ${migrationName}`);
      console.log('⚠️  Note: This only removes the migration record. Manual cleanup may be required.');

    } catch (error) {
      console.error(`❌ Rollback failed:`, error.message);
      throw error;
    }
  }

  async status() {
    try {
      const executed = await this.getExecutedMigrations();
      const pending = await this.getPendingMigrations();

      console.log('\n📊 Migration Status:');
      console.log(`   ✅ Executed: ${executed.length}`);
      console.log(`   🔄 Pending: ${pending.length}`);

      if (executed.length > 0) {
        console.log('\n📋 Executed migrations:');
        executed.forEach(name => console.log(`   ✅ ${name}`));
      }

      if (pending.length > 0) {
        console.log('\n🔄 Pending migrations:');
        pending.forEach(name => console.log(`   ⏳ ${name}`));
      }

    } catch (error) {
      console.error('Failed to get migration status:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const runner = new MigrationRunner();
  const command = process.argv[2];

  switch (command) {
    case 'run':
      await runner.runMigrations();
      break;

    case 'status':
      await runner.status();
      break;

    case 'rollback':
      const migrationName = process.argv[3];
      if (!migrationName) {
        console.error('Usage: npm run migrate rollback <migration-name>');
        process.exit(1);
      }
      await runner.rollback(migrationName);
      break;

    default:
      console.log(`
📦 Twin AI Database Migration Tool

Usage:
  npm run migrate run      - Run all pending migrations
  npm run migrate status   - Show migration status
  npm run migrate rollback <name> - Rollback a migration

Environment Variables:
  MIGRATION_CONTINUE_ON_ERROR=true - Continue on migration errors
      `);
      break;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { MigrationRunner };