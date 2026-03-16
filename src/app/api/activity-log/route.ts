import { NextResponse } from 'next/server'
import { logActivity, ActionType } from '@/app/actions/activityLogs'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { action_type, description, related_deal_id, related_company_id, metadata } = body

        if (!action_type || !description) {
            return NextResponse.json({ error: 'action_type and description are required' }, { status: 400 })
        }

        const result = await logActivity(action_type as ActionType, description, {
            related_deal_id: related_deal_id || null,
            related_company_id: related_company_id || null,
            metadata: metadata || {},
        })

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        console.error('Failed to create activity log:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
