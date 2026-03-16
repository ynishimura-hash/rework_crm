import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config({ path: '.env.rework' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// 請求書情報（固定）
const TARGET_INVOICE_ID = '52254195';
const PARTNER_NAME = '楠塗装';
const AMOUNT = 14278;
const TITLE = '定額HPスタンダードプラン2月分費用';
const ISSUE_DATE = '2026-02-20';

async function main() {
    console.log(`--- Syncing Invoice ${TARGET_INVOICE_ID} ---`);
    try {
        // 1. 企業（Company）の解決または作成
        let companyId;
        const { data: existingCompany } = await supabase
            .from('companies')
            .select('id')
            .eq('name', PARTNER_NAME)
            .maybeSingle();

        if (existingCompany) {
            console.log(`Found existing company: ${PARTNER_NAME} (${existingCompany.id})`);
            companyId = existingCompany.id;
        } else {
            console.log(`Creating new company: ${PARTNER_NAME}...`);
            const { data: newCompany, error: companyError } = await supabase
                .from('companies')
                .insert({ name: PARTNER_NAME, status: '成約' })
                .select('id')
                .single();

            if (companyError) throw companyError;
            companyId = newCompany.id;
            console.log(`Company created: ${companyId}`);
        }

        // 2. 商談（Deal）の作成
        console.log(`Creating Deal for Invoice ${TARGET_INVOICE_ID}...`);
        
        // 既存チェック
        const { data: existingDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('freee_invoice_id', TARGET_INVOICE_ID)
            .maybeSingle();

        if (existingDeal) {
            console.log(`Deal already exists for this invoice (Deal ID: ${existingDeal.id}). Skipping creation.`);
            return;
        }

        const { data: newDeal, error: dealError } = await supabase
            .from('deals')
            .insert({
                title: TITLE || `${PARTNER_NAME}様 請求・入金確認`,
                company_id: companyId,
                status: '入金確認完了',
                estimated_amount: AMOUNT,
                close_date: ISSUE_DATE,
                freee_invoice_id: TARGET_INVOICE_ID,
            })
            .select('id')
            .single();

        if (dealError) throw dealError;
        console.log(`Deal successfully created: ${newDeal.id}`);

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
