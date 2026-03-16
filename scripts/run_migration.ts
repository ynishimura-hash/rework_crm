import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.rework' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// https://wocyevdjiatficfwvjlm.supabase.co
const projectId = supabaseUrl.replace('https://', '').split('.')[0];
const dbPassword = 'UZrMHYLRjFM6veNx'; // ユーザー提供パスワード

// Supabaseのコネクションプーラー（IPv4対応）の標準ホスト名に接続する
const dbHost = `aws-0-ap-northeast-1.pooler.supabase.com`;
const connectionString = `postgres://postgres.${projectId}:${dbPassword}@${dbHost}:6543/postgres`;

console.log(`Connecting to Postgres with connection string...`);

const sql = postgres(connectionString, {
  ssl: 'require',
  max: 1
});

async function runMigration() {
  try {
    const sqlPath = path.join(process.cwd(), 'supabase', 'full_migration.sql');
    const migrationSql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running full_migration.sql...');
    await sql.unsafe(migrationSql);
    console.log('Migration completed successfully!');
    
    // マイグレーション成功したらseedスクリプトを呼び出す
    console.log('Starting seed script...');
    execSync('npx tsx scripts/seed_from_excel.ts', { stdio: 'inherit' });

  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await sql.end();
  }
}

runMigration();
