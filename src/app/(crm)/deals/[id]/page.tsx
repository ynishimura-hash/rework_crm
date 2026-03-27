"use client"

import { useState, use, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getDealById, updateDeal } from "@/app/actions/deals"
import { getMeetingNotesByDealId, createMeetingNote } from "@/app/actions/meetingNotes"
import { getPaymentRecordsByDealId, createPaymentRecord, deletePaymentRecord } from "@/app/actions/paymentRecords"
import {
    Briefcase,
    Building2,
    Users,
    ArrowLeft,
    Save,
    Calendar,
    FileText,
    Plus,
    RefreshCw,
    CheckCircle2,
    CreditCard,
    ClipboardList,
    Send,
    ChevronDown,
    Trash2
} from "lucide-react"
import CreateFreeeInvoiceModal from "@/components/deals/CreateFreeeInvoiceModal"
import DeleteConfirmDialog from "@/components/ui/DeleteConfirmDialog"
import { deleteDeal } from "@/app/actions/deals"

// クライアントからログを記録するヘルパー
async function postLog(action_type: string, description: string, opts?: { related_deal_id?: string, related_company_id?: string, metadata?: Record<string, any> }) {
    try {
        await fetch('/api/activity-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_type, description, ...opts }),
        })
    } catch (e) {
        console.error('Failed to post activity log:', e)
    }
}

// freee帳票URL生成: 2023年10月11日以降は新URL、それ以前は旧URL
const FREEE_NEW_INVOICE_CUTOFF = "2023-10-11"
function getFreeeQuotationUrl(id: string, issueDate?: string | null): string {
    if (issueDate && issueDate < FREEE_NEW_INVOICE_CUTOFF) {
        return `https://secure.freee.co.jp/docs_v2/quotation/${id}`
    }
    return `https://invoice.secure.freee.co.jp/reports/quotations/${id}`
}
function getFreeeInvoiceUrl(id: string, issueDate?: string | null): string {
    if (issueDate && issueDate < FREEE_NEW_INVOICE_CUTOFF) {
        return `https://secure.freee.co.jp/docs_v2/invoice/${id}`
    }
    return `https://invoice.secure.freee.co.jp/reports/invoices/${id}`
}

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    const resolvedParams = use(params)
    const dealId = resolvedParams.id

    // DB状態管理
    const [dealInfo, setDealInfo] = useState<any>(null)
    const [companyInfo, setCompanyInfo] = useState<any>(null)
    const [contactInfo, setContactInfo] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Freee連携状態
    const [isFreeeLoading, setIsFreeeLoading] = useState(false)
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
    const [freeeInvoice, setFreeeInvoice] = useState<any>(null)
    const [freeeQuotation, setFreeeQuotation] = useState<any>(null)
    const [freeeTxns, setFreeeTxns] = useState<any[]>([])

    // 過去履歴用
    const [freeeDocuments, setFreeeDocuments] = useState<{ invoices: any[], quotations: any[] }>({ invoices: [], quotations: [] })
    const [isDocumentsLoading, setIsDocumentsLoading] = useState(false)
    
    // 見積書用モーダル状態
    const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false)
    // 再連携検索モーダル: 'quotation' | 'invoice' | null
    const [showLinkSearch, setShowLinkSearch] = useState<'quotation' | 'invoice' | null>(null)
    // 関連書類履歴の折りたたみ
    const [isDocHistoryOpen, setIsDocHistoryOpen] = useState(false)

    const [isEditing, setIsEditing] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)

    const handleDeleteDeal = async () => {
        await deleteDeal(dealId)
        router.push('/deals')
    }

    const [editForm, setEditForm] = useState({
        title: '',
        company_id: '',
        contact_id: '',
        status: '',
        estimated_amount: '',
        close_date: '',
        expected_amount: '',
        first_appointment_date: '',
        next_appointment_date: '',
        action_plan: '',
        payment_due_date: '',
        result_date: '',
    })

    // 議事録状態
    const [meetingNotes, setMeetingNotes] = useState<any[]>([])

    // 入金履歴状態
    const [paymentRecords, setPaymentRecords] = useState<any[]>([])
    const [showPaymentForm, setShowPaymentForm] = useState(false)

    useEffect(() => {
        async function loadData() {
            try {
                const deal = await getDealById(dealId)
                if (deal) {
                    setDealInfo(deal)
                    setCompanyInfo(deal.companies || null)
                    setContactInfo(deal.contacts || null)

                    setEditForm({
                        title: deal.title || '',
                        company_id: deal.company_id || '',
                        contact_id: deal.contact_id || '',
                        status: deal.status || '商談中',
                        estimated_amount: deal.estimated_amount?.toString() || '0',
                        close_date: deal.close_date ? new Date(deal.close_date).toISOString().split('T')[0] : '',
                        expected_amount: deal.expected_amount?.toString() || '',
                        first_appointment_date: deal.first_appointment_date ? new Date(deal.first_appointment_date).toISOString().split('T')[0] : '',
                        next_appointment_date: deal.next_appointment_date ? new Date(deal.next_appointment_date).toISOString().split('T')[0] : '',
                        action_plan: deal.action_plan || '',
                        payment_due_date: deal.payment_due_date ? new Date(deal.payment_due_date).toISOString().split('T')[0] : '',
                        result_date: deal.result_date ? new Date(deal.result_date).toISOString().split('T')[0] : '',
                    })

                    // 議事録を取得
                    const notes = await getMeetingNotesByDealId(dealId)
                    setMeetingNotes(notes)

                    // 入金履歴を取得
                    const payments = await getPaymentRecordsByDealId(dealId)
                    setPaymentRecords(payments)

                    // freeeの請求書IDが保存されていればステータスを取得
                    if (deal.freee_invoice_id) {
                        fetchInvoiceStatus(deal.freee_invoice_id)
                    }
                    // freeeの見積書IDが保存されていればステータスを取得
                    if (deal.freee_quotation_id) {
                        fetchQuotationStatus(deal.freee_quotation_id)
                    }
                    // 過去の書類一覧を取得
                    if (deal.companies && deal.companies.name) {
                        fetchFreeeDocuments(deal.companies.name)
                    }
                }
            } catch (error) {
                console.error("Failed to fetch deal details:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [dealId])

    const fetchFreeeDocuments = async (companyName: string) => {
        setIsDocumentsLoading(true)
        try {
            const res = await fetch(`/api/freee/partner-documents?company_name=${encodeURIComponent(companyName)}`)
            if (res.status === 401) {
                // handleFreeeAuthErrorのアラートを出すか無視するか。ここでは無視してもいいが、UXのため出す
                // ただし複数回出るのを防ぐためシンプルにするか、ここではサイレントにする
            } else {
                const data = await res.json()
                if (data.success) {
                    setFreeeDocuments({ invoices: data.data.invoices || [], quotations: data.data.quotations || [] })
                }
            }
        } catch (e) {
            console.error(e)
        } finally {
            setIsDocumentsLoading(false)
        }
    }

    // freeeの請求書ステータスを取得する処理（初期ロード用: 自動連携解除しない）
    const fetchInvoiceStatus = async (invoiceId: string) => {
        try {
            const res = await fetch(`/api/freee/invoice-status?id=${invoiceId}`)
            const data = await res.json()

            if (data.is_deleted) {
                // 初期ロードでは自動解除せず、フォールバック表示にする
                setFreeeInvoice({ id: invoiceId, _notFound: true })
                return;
            }

            if (data.success && data.data) {
                setFreeeInvoice(data.data)

                // 入金済みが検出されたら自動的に商談ステータスを更新する（自動消込）
                if (data.data.payment_status === 'settled') {
                    const currentDeal = await getDealById(dealId);
                    if (currentDeal && currentDeal.status !== '入金確認完了') {
                        const updatedDeal = await updateDeal(dealId, { status: '入金確認完了' });
                        setDealInfo((prev: any) => ({ ...prev, ...updatedDeal }));
                        setEditForm((prev: any) => ({ ...prev, status: '入金確認完了' }));
                    }
                }
            } else {
                // API取得失敗時はフォールバック表示用に最低限の情報をセット
                setFreeeInvoice({ id: invoiceId, _fetchFailed: true })
            }
        } catch (e) {
            console.error("Failed to fetch freee invoice status", e)
            setFreeeInvoice({ id: invoiceId, _fetchFailed: true })
        }
    }

    const handleFreeeAuthError = (status: number) => {
        if (status === 401) {
            if (window.confirm('freeeの認証情報が有効ではありません。再認証画面へ移動しますか？')) {
                window.location.href = '/api/freee/auth';
            }
            return true;
        }
        return false;
    }

    // 名前の正規化（会社名マッチ用）
    const normalizeName = (name: string) =>
        name.replace(/\s+/g, '').replace(/[\u3000]/g, '')
            .replace(/（株）|株式会社|（有）|有限会社|合同会社|（合）|\(株\)|\(有\)|\(合\)|㈱|㈲/g, '')
            .toLowerCase()

    // freeeの入金明細を取得し、この商談に関連するものだけにフィルタ
    const fetchWalletTxns = async () => {
        setIsFreeeLoading(true)
        try {
            const res = await fetch(`/api/freee/wallet-txns?limit=100`)
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json()
            if (data.success && data.data) {
                const allTxns = data.data || []
                const dealAmount = Number(dealInfo?.estimated_amount) || 0
                const companyName = companyInfo?.name || ''
                const normalizedCompany = companyName ? normalizeName(companyName) : ''

                // この商談に関連する明細のみフィルタ
                // 条件: 金額が近い（±5%以内）OR 摘要に社名が含まれる
                const filtered = allTxns.filter((txn: any) => {
                    // 社名マッチ
                    if (normalizedCompany && txn.description) {
                        const normalizedDesc = normalizeName(txn.description)
                        if (normalizedDesc.includes(normalizedCompany) || normalizedCompany.includes(normalizedDesc)) {
                            return true
                        }
                    }
                    // 金額近似マッチ（±5%）
                    if (dealAmount > 0 && txn.amount > 0) {
                        const diff = Math.abs(txn.amount - dealAmount)
                        if (diff / dealAmount <= 0.05) return true
                    }
                    return false
                })
                setFreeeTxns(filtered)
            } else {
                console.error("Failed to fetch wallet txns", data)
            }
        } catch (e) {
            console.error("Failed to fetch freee wallet txns", e)
        } finally {
            setIsFreeeLoading(false)
        }
    }

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const formData = new FormData()
            formData.append('title', editForm.title)
            formData.append('company_id', editForm.company_id)
            if (editForm.contact_id) formData.append('contact_id', editForm.contact_id)
            formData.append('status', editForm.status)
            formData.append('estimated_amount', editForm.estimated_amount)
            if (editForm.close_date) formData.append('close_date', editForm.close_date)
            if (editForm.expected_amount) formData.append('expected_amount', editForm.expected_amount)
            if (editForm.first_appointment_date) formData.append('first_appointment_date', editForm.first_appointment_date)
            if (editForm.next_appointment_date) formData.append('next_appointment_date', editForm.next_appointment_date)
            if (editForm.action_plan) formData.append('action_plan', editForm.action_plan)
            if (editForm.payment_due_date) formData.append('payment_due_date', editForm.payment_due_date)
            if (editForm.result_date) formData.append('result_date', editForm.result_date)

            const updatedDeal = await updateDeal(dealId, formData)
            // リレーション部分を維持しつつ更新
            setDealInfo({ ...dealInfo, ...updatedDeal, companies: companyInfo, contacts: contactInfo })
            setIsEditing(false)
            alert('変更を保存しました。')
        } catch (error) {
            console.error("Update failed:", error)
            alert('保存に失敗しました。')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateFreeeInvoice = async (invoiceData: any) => {
        setIsFreeeLoading(true);
        try {
            const res = await fetch('/api/freee/create-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoiceData)
            });
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json();
            if (res.ok && data.data?.invoice?.id) {
                // 成功したら商談にfreeeの請求書IDを保存する
                const updatedDeal = await updateDeal(dealId, { freee_invoice_id: data.data.invoice.id })
                setDealInfo({ ...dealInfo, ...updatedDeal })
                setFreeeInvoice(data.data.invoice)
                setIsInvoiceModalOpen(false)
                await postLog('invoice_created', `freee請求書を作成（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { freee_invoice_id: data.data.invoice.id } })
                alert('成功しました！\nfreeeに請求書が作成され、商談に紐付けられました。');
                // 最新の履歴を取得し直す
                if (companyInfo && companyInfo.name) fetchFreeeDocuments(companyInfo.name);
            } else {
                console.error('API Error:', data);
                alert(`エラーが発生しました: ${JSON.stringify(data.details || data.error)}`);
            }
        } catch (err) {
            alert('通信エラーが発生しました');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    const handleCreateFreeeQuotation = async (quotationData: any) => {
        setIsFreeeLoading(true);
        try {
            const res = await fetch('/api/freee/create-quotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quotationData)
            });
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json();
            if (res.ok && data.data?.quotation?.id) {
                // 成功したら商談にfreeeの見積書IDを保存する
                const updatedDeal = await updateDeal(dealId, { freee_quotation_id: data.data.quotation.id })
                setDealInfo({ ...dealInfo, ...updatedDeal })
                setIsQuotationModalOpen(false)
                await postLog('quotation_created', `freee見積書を作成（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { freee_quotation_id: data.data.quotation.id } })
                alert('成功しました！\nfreeeに見積書が作成されました。');
                // 最新の履歴を取得し直す
                if (companyInfo && companyInfo.name) fetchFreeeDocuments(companyInfo.name);
            } else {
                console.error('API Error:', data);
                alert(`エラーが発生しました: ${JSON.stringify(data.details || data.error)}`);
            }
        } catch (err) {
            alert('通信エラーが発生しました');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    const handleSendInvoice = async () => {
        if (!freeeInvoice?.id) return;
        if (!window.confirm('この請求書をfreee上で「発行済(送付済)」として処理しますか？\n(※実際のfreeeの仕様により、ステータスが更新されます)')) return;

        setIsFreeeLoading(true);
        try {
            const res = await fetch(`/api/freee/issue-invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: freeeInvoice.id })
            });
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json();
            if (data.success) {
                await postLog('invoice_created', `freee請求書を発行（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { freee_invoice_id: freeeInvoice.id, action: 'issue' } })
                alert('請求書の発行(送付)処理が完了しました。');
                // 最新ステータスを再取得
                handleCheckPaymentStatus();
            } else {
                alert(`エラーが発生しました: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('通信エラーが発生しました');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    const handleUnlinkDocument = async (type: 'quotation' | 'invoice') => {
        if (!window.confirm(`この${type === 'quotation' ? '見積書' : '請求書'}の連携を解除しますか？\nシステム上の紐付けのみが解除され、freee側のデータはそのまま残ります。`)) return;
        
        setIsFreeeLoading(true);
        try {
            const updateData = type === 'quotation' 
                ? { freee_quotation_id: null } 
                : { freee_invoice_id: null };
            
            const updatedDeal = await updateDeal(dealId, updateData);
            setDealInfo({ ...dealInfo, ...updatedDeal });
            
            if (type === 'quotation') {
                setFreeeQuotation(null);
            } else {
                setFreeeInvoice(null);
            }
            await postLog('freee_unlinked', `freee${type === 'quotation' ? '見積書' : '請求書'}の連携を解除（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { type } })
            alert('連携を解除しました。');
        } catch (e) {
            console.error('Failed to unlink document', e);
            alert('連携の解除に失敗しました。');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    // freee書類を検索して再連携
    const handleLinkDocument = async (type: 'quotation' | 'invoice', docId: string) => {
        const label = type === 'quotation' ? '見積書' : '請求書'
        if (!window.confirm(`この${label}（ID: ${docId}）を商談に連携しますか？`)) return;
        setIsFreeeLoading(true);
        try {
            const updateData = type === 'quotation'
                ? { freee_quotation_id: docId.toString() }
                : { freee_invoice_id: docId.toString() };
            const updatedDeal = await updateDeal(dealId, updateData);
            setDealInfo({ ...dealInfo, ...updatedDeal });
            // 連携後にステータスを取得
            if (type === 'quotation') {
                await fetchQuotationStatus(docId.toString());
            } else {
                await fetchInvoiceStatus(docId.toString());
            }
            await postLog('freee_linked', `freee${label}を再連携（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { type, doc_id: docId } })
            setShowLinkSearch(null);
            alert(`${label}を連携しました。`);
        } catch (e) {
            console.error('Failed to link document', e);
            alert('連携に失敗しました。');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    const handleCheckPaymentStatus = async (silent = false) => {
        if (!freeeInvoice?.id && !dealInfo?.freee_invoice_id) return;
        const targetId = freeeInvoice?.id || dealInfo?.freee_invoice_id;
        setIsFreeeLoading(true);
        try {
            const res = await fetch(`/api/freee/invoice-status?id=${targetId}`)
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json()

            if (data.is_deleted) {
                if (!silent) alert('連携中の請求書がfreee上で見つかりません（削除・キャンセルされた可能性があります）。連携を解除します。');
                setFreeeInvoice(null);
                const updatedDeal = await updateDeal(dealId, { freee_invoice_id: null });
                setDealInfo(updatedDeal);
                return;
            }

            if (data.error && !data.success) {
                if (!silent) alert(`エラー: ${data.error}`)
                return;
            }

            if (data.success && data.data) {
                setFreeeInvoice(data.data)

                // 入金済み(settled)になっていれば、商談ステータスも更新する
                if (data.data.payment_status === 'settled') {
                    const updatedDeal = await updateDeal(dealId, { status: '入金確認完了' })
                    setDealInfo({ ...dealInfo, ...updatedDeal })
                    setEditForm(prev => ({ ...prev, status: '入金確認完了' }))
                    // 入金履歴を自動記録
                    try {
                        const record = await createPaymentRecord({
                            deal_id: dealId,
                            company_id: companyInfo?.id || null,
                            amount: data.data.total_amount || dealInfo?.estimated_amount || 0,
                            payment_date: data.data.payment_date || data.data.issue_date || null,
                            description: `freee請求書 #${targetId} 入金確認`,
                            freee_txn_id: `inv_${targetId}`,
                        })
                        if (record) {
                            const payments = await getPaymentRecordsByDealId(dealId)
                            setPaymentRecords(payments)
                        }
                    } catch (e) { console.error('Failed to auto-create payment record:', e) }
                    await postLog('payment_confirmed', `入金確認完了（商談: ${dealInfo?.title}）`, { related_deal_id: dealId, related_company_id: companyInfo?.id, metadata: { freee_invoice_id: targetId } })
                    if (!silent) alert('freee側で入金済みが確認できました！\n商談ステータスを「入金確認完了」に更新しました。')
                } else {
                    if (!silent) alert(`現在のステータス: ${data.data.payment_status === 'unsettled' ? '未入金' : data.data.payment_status}\nまだfreee側で消込(入金確認)が完了していません。`)
                }
            }
        } catch (e) {
            if (!silent) alert('ステータスの確認に失敗しました。')
        } finally {
            setIsFreeeLoading(false);
        }
    }

    // 見積書ステータスの取得（初期ロード用: 自動連携解除しない）
    const fetchQuotationStatus = async (quotationId: string) => {
        try {
            const res = await fetch(`/api/freee/quotation-status?id=${quotationId}`)
            const data = await res.json()

            if (data.is_deleted) {
                // 初期ロードでは自動解除せず、フォールバック表示にする
                setFreeeQuotation({ id: quotationId, _notFound: true })
                return;
            }

            if (data.success && data.data) {
                setFreeeQuotation(data.data)
            } else {
                setFreeeQuotation({ id: quotationId, _fetchFailed: true })
            }
        } catch (e) {
            console.error("Failed to fetch freee quotation status", e)
            setFreeeQuotation({ id: quotationId, _fetchFailed: true })
        }
    }

    const handleCheckQuotationStatus = async (silent = false) => {
        if (!freeeQuotation?.id && !dealInfo?.freee_quotation_id) return;
        const targetId = freeeQuotation?.id || dealInfo?.freee_quotation_id;
        setIsFreeeLoading(true);
        try {
            const res = await fetch(`/api/freee/quotation-status?id=${targetId}`)
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json()

            if (data.is_deleted) {
                if (!silent) alert('連携中の見積書がfreee上で見つかりません（削除・キャンセルされた可能性があります）。連携を解除します。');
                setFreeeQuotation(null);
                const updatedDeal = await updateDeal(dealId, { freee_quotation_id: null });
                setDealInfo(updatedDeal);
                return;
            }

            if (data.success && data.data) {
                setFreeeQuotation(data.data)
                if (!silent) alert('ステータスを更新しました！')
            } else if (data.error) {
                if (!silent) alert(`エラー: ${data.error}`)
            }
        } catch (e) {
            if (!silent) alert('ステータスの確認に失敗しました。')
        } finally {
            setIsFreeeLoading(false);
        }
    }

    const handleSendQuotation = async () => {
        if (!freeeQuotation?.id && !dealInfo?.freee_quotation_id) return;
        const targetId = freeeQuotation?.id || dealInfo?.freee_quotation_id;
        if (!window.confirm('この見積書をfreee上で「発行済(送付済)」として処理しますか？\n(※実際のfreeeの仕様により、ステータスが更新されます)')) return;

        setIsFreeeLoading(true);
        try {
            const res = await fetch(`/api/freee/issue-quotation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotation_id: targetId })
            });
            if (handleFreeeAuthError(res.status)) return;
            const data = await res.json();
            if (data.success) {
                alert('見積書の発行(送付)処理が完了しました。');
                handleCheckQuotationStatus(true);
            } else {
                alert(`エラーが発生しました: ${data.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('通信エラーが発生しました');
        } finally {
            setIsFreeeLoading(false);
        }
    }

    if (isLoading) {
        return <div className="p-4 md:p-8 text-center text-blue-600 animate-pulse">データを読み込み中...</div>
    }

    if (!dealInfo) {
        return <div className="p-4 md:p-8 text-center text-slate-500">商談データが見つかりません。</div>
    }

    return (
        <div className="space-y-6 pb-20">
            {/* 戻るボタン */}
            <div>
                <button onClick={() => router.back()} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    商談一覧へ戻る
                </button>
            </div>

            {/* 商談ヘッダー */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-8 relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 space-y-4 w-full">
                        {isEditing ? (
                            <div className="space-y-4 w-full max-w-2xl bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">商談タイトル</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.title}
                                            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">対象企業</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm cursor-not-allowed bg-slate-100"
                                            value={companyInfo?.name || '不明'}
                                            readOnly
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">ステータス</label>
                                        <select
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.status}
                                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                        >
                                            <option>商談中</option>
                                            <option>提案済</option>
                                            <option>見積提出済</option>
                                            <option>請求書発行</option>
                                            <option>契約書/計画届</option>
                                            <option>成約</option>
                                            <option>入金確認完了</option>
                                            <option>失注</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">商談金額</label>
                                        <input
                                            type="number"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.estimated_amount}
                                            onChange={e => setEditForm({ ...editForm, estimated_amount: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">成約見込時期</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.close_date}
                                            onChange={e => setEditForm({ ...editForm, close_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">見込み予測金額</label>
                                        <input
                                            type="number"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.expected_amount}
                                            onChange={e => setEditForm({ ...editForm, expected_amount: e.target.value })}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">初回アポ日</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.first_appointment_date}
                                            onChange={e => setEditForm({ ...editForm, first_appointment_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">次回アポ日</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.next_appointment_date}
                                            onChange={e => setEditForm({ ...editForm, next_appointment_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">入金期日</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.payment_due_date}
                                            onChange={e => setEditForm({ ...editForm, payment_due_date: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">受注・失注日</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                            value={editForm.result_date}
                                            onChange={e => setEditForm({ ...editForm, result_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">アクションプラン</label>
                                        <textarea
                                            className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm min-h-[80px] resize-y"
                                            value={editForm.action_plan}
                                            onChange={e => setEditForm({ ...editForm, action_plan: e.target.value })}
                                            placeholder="今後のアクションプランを入力..."
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded">キャンセル</button>
                                    <button onClick={handleSave} className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm">
                                        <Save className="w-4 h-4" />
                                        保存
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${dealInfo.status === '入金確認完了' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                        {dealInfo.status}
                                    </span>
                                </div>
                                <h1 className="text-3xl font-bold text-slate-900">{dealInfo.title}</h1>

                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
                                    {companyInfo ? (
                                        <Link href={`/companies/${companyInfo.id}`} className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium">
                                            <Building2 className="w-4 h-4" />
                                            {companyInfo.name}
                                        </Link>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <Building2 className="w-4 h-4 text-slate-400" />
                                            企業情報非連携
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <Users className="w-4 h-4 text-slate-400" />
                                        {contactInfo ? contactInfo.name : '担当者未設定'}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        見込時期: {dealInfo.close_date ? new Date(dealInfo.close_date).toLocaleDateString() : '未定'}
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-6">
                                    <div>
                                        <div className="text-xs text-slate-500 font-medium mb-1">商談金額</div>
                                        <div className="text-2xl font-bold text-slate-900">{dealInfo.estimated_amount ? `¥${Number(dealInfo.estimated_amount).toLocaleString()}` : '未定'}</div>
                                    </div>
                                    {dealInfo.expected_amount && (
                                        <div>
                                            <div className="text-xs text-slate-500 font-medium mb-1">見込み予測金額</div>
                                            <div className="text-2xl font-bold text-indigo-600">¥{Number(dealInfo.expected_amount).toLocaleString()}</div>
                                        </div>
                                    )}
                                    <div>
                                        <div className="text-xs text-slate-500 font-medium mb-1">提案サービス</div>
                                        <div className="flex gap-2 mt-1">
                                            <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded">要件定義・DX支援</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 追加フィールド表示 */}
                                {(dealInfo.next_appointment_date || dealInfo.action_plan || dealInfo.payment_due_date) && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {dealInfo.next_appointment_date && (
                                            <div className="flex items-start gap-2">
                                                <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-xs text-slate-500 font-medium">次回アポ日</div>
                                                    <div className="text-sm font-semibold text-slate-900">{new Date(dealInfo.next_appointment_date).toLocaleDateString('ja-JP')}</div>
                                                </div>
                                            </div>
                                        )}
                                        {dealInfo.payment_due_date && (
                                            <div className="flex items-start gap-2">
                                                <CreditCard className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-xs text-slate-500 font-medium">入金期日</div>
                                                    <div className="text-sm font-semibold text-slate-900">{new Date(dealInfo.payment_due_date).toLocaleDateString('ja-JP')}</div>
                                                </div>
                                            </div>
                                        )}
                                        {dealInfo.result_date && (
                                            <div className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-xs text-slate-500 font-medium">受注・失注日</div>
                                                    <div className="text-sm font-semibold text-slate-900">{new Date(dealInfo.result_date).toLocaleDateString('ja-JP')}</div>
                                                </div>
                                            </div>
                                        )}
                                        {dealInfo.action_plan && (
                                            <div className="col-span-1 md:col-span-3 flex items-start gap-2">
                                                <ClipboardList className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-xs text-slate-500 font-medium">アクションプラン</div>
                                                    <div className="text-sm text-slate-800 whitespace-pre-wrap mt-0.5">{dealInfo.action_plan}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {!isEditing && (
                        <div className="flex flex-col gap-2 shrink-0">
                            {/* freee見積書連携されていない場合のみ作成ボタンを表示 */}
                            {!dealInfo.freee_quotation_id ? (
                                <button
                                    onClick={() => setIsQuotationModalOpen(true)}
                                    disabled={isFreeeLoading}
                                    className="px-5 py-2.5 bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <FileText className="w-4 h-4" />
                                    見積書を作成 (freee連携)
                                </button>
                            ) : (
                                <a
                                    href={getFreeeQuotationUrl(dealInfo.freee_quotation_id, freeeQuotation?.issue_date)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-5 py-2.5 bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <FileText className="w-4 h-4" />
                                    freeeで見積書を開く
                                </a>
                            )}
                            {/* freee請求書連携されていない場合のみ作成ボタンを表示 */}
                            {!dealInfo.freee_invoice_id ? (
                                <button
                                    onClick={() => setIsInvoiceModalOpen(true)}
                                    disabled={isFreeeLoading}
                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    {isFreeeLoading ? "処理中..." : "請求書を作成 (freee連携)"}
                                </button>
                            ) : (
                                <a
                                    href={getFreeeInvoiceUrl(dealInfo.freee_invoice_id, freeeInvoice?.issue_date)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-5 py-2.5 bg-white border border-blue-600 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    freeeで請求書を開く
                                </a>
                            )}
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 mt-2"
                            >
                                商談情報を編集
                            </button>
                            <button
                                onClick={() => setShowDeleteDialog(true)}
                                className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-sm font-medium hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 mt-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                削除
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* メインエリア */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    {/* Freee連携パネル */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-0 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-blue-600" />
                                <h2 className="text-lg font-bold text-slate-900">freee 連携ダッシュボード</h2>
                            </div>
                        </div>

                        <div className="p-6">
                            {dealInfo.freee_invoice_id || dealInfo.freee_quotation_id ? (
                                <div className="space-y-6">
                                    {dealInfo.freee_quotation_id && (
                                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl relative overflow-hidden">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500 font-medium mb-0.5">連携中のfreee見積書</div>
                                                    <div className="text-lg font-bold text-slate-900">{freeeQuotation ? (freeeQuotation._fetchFailed || freeeQuotation._notFound ? `見積書 #${dealInfo.freee_quotation_id}` : (freeeQuotation.title || freeeQuotation.subject || freeeQuotation.quotation_number || freeeQuotation.description || '（件名なし）')) : '取得中...'}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {freeeQuotation?._notFound ? (
                                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">freee上で見つかりません（旧帳票の可能性あり）</span>
                                                        ) : freeeQuotation?._fetchFailed ? (
                                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">freee未認証 - 再認証してください</span>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-slate-500">
                                                                    見積額: ¥{freeeQuotation?.total_amount ? freeeQuotation.total_amount.toLocaleString() : '---'}
                                                                </span>
                                                                <span className="text-slate-300">|</span>
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${freeeQuotation?.quotation_status === 'issue' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {freeeQuotation?.quotation_status === 'issue' ? '送付済み' : '未送付'}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleCheckQuotationStatus()}
                                                    disabled={isFreeeLoading}
                                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                                                >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${isFreeeLoading ? 'animate-spin' : ''}`} />
                                                    ステータス更新
                                                </button>
                                                <div className="flex gap-2">
                                                    <a
                                                        href={getFreeeQuotationUrl(dealInfo.freee_quotation_id, freeeQuotation?.issue_date)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors text-center"
                                                    >
                                                        freeeで開く
                                                    </a>
                                                    <button
                                                        onClick={handleSendQuotation}
                                                        disabled={isFreeeLoading || freeeQuotation?.quotation_status === 'issue'}
                                                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors text-center disabled:opacity-50"
                                                    >
                                                        送付・発行
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleUnlinkDocument('quotation')}
                                                    disabled={isFreeeLoading}
                                                    className="px-3 py-1.5 mt-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded text-xs font-medium transition-colors text-center w-full"
                                                >
                                                    連携を解除
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {dealInfo.freee_invoice_id && (
                                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl relative overflow-hidden">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                                    <FileText className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500 font-medium mb-0.5">連携中のfreee請求書</div>
                                                    <div className="text-lg font-bold text-slate-900">{freeeInvoice ? (freeeInvoice._fetchFailed || freeeInvoice._notFound ? `請求書 #${dealInfo.freee_invoice_id}` : (freeeInvoice.title || freeeInvoice.subject || freeeInvoice.invoice_number || freeeInvoice.description || '（件名なし）')) : '取得中...'}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {freeeInvoice?._notFound ? (
                                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">freee上で見つかりません（旧帳票の可能性あり）</span>
                                                        ) : freeeInvoice?._fetchFailed ? (
                                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">freee未認証 - 再認証してください</span>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-slate-500">
                                                                    請求額: ¥{freeeInvoice?.total_amount ? freeeInvoice.total_amount.toLocaleString() : '---'}
                                                                </span>
                                                                <span className="text-slate-300">|</span>
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${freeeInvoice?.invoice_status === 'issue' || freeeInvoice?.payment_status === 'settled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {freeeInvoice?.payment_status === 'settled' ? '入金済み' : (freeeInvoice?.invoice_status === 'issue' ? '送付済み(未入金)' : '未送付(未入金)')}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleCheckPaymentStatus()}
                                                    disabled={isFreeeLoading}
                                                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                                                >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${isFreeeLoading ? 'animate-spin' : ''}`} />
                                                    ステータス更新
                                                </button>
                                                <div className="flex gap-2">
                                                    <a
                                                        href={getFreeeInvoiceUrl(dealInfo.freee_invoice_id, freeeInvoice?.issue_date)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors text-center"
                                                    >
                                                        freeeで開く
                                                    </a>
                                                    <button
                                                        onClick={handleSendInvoice}
                                                        disabled={isFreeeLoading || freeeInvoice?.invoice_status === 'issue' || freeeInvoice?.payment_status === 'settled'}
                                                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors text-center disabled:opacity-50"
                                                    >
                                                        送付・発行
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleUnlinkDocument('invoice')}
                                                    disabled={isFreeeLoading}
                                                    className="px-3 py-1.5 mt-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded text-xs font-medium transition-colors text-center w-full"
                                                >
                                                    連携を解除
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* 未連携書類の検索ボタン */}
                                    {(!dealInfo.freee_quotation_id || !dealInfo.freee_invoice_id) && (
                                        <div className="flex gap-3 pt-2">
                                            {!dealInfo.freee_quotation_id && (
                                                <button
                                                    onClick={() => { setShowLinkSearch('quotation'); if (companyInfo?.name) fetchFreeeDocuments(companyInfo.name); }}
                                                    disabled={isFreeeLoading}
                                                    className="flex-1 px-4 py-2 text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    既存の見積書を検索して連携
                                                </button>
                                            )}
                                            {!dealInfo.freee_invoice_id && (
                                                <button
                                                    onClick={() => { setShowLinkSearch('invoice'); if (companyInfo?.name) fetchFreeeDocuments(companyInfo.name); }}
                                                    disabled={isFreeeLoading}
                                                    className="flex-1 px-4 py-2 text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <RefreshCw className="w-3 h-3" />
                                                    既存の請求書を検索して連携
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* この商談に関連する入金明細 */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-800">該当する入金明細</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">金額(±5%)または社名が一致する入金のみ表示</p>
                                            </div>
                                            <button
                                                onClick={fetchWalletTxns}
                                                disabled={isFreeeLoading}
                                                className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                明細を検索
                                            </button>
                                        </div>

                                        {freeeTxns.length > 0 ? (
                                            <div className="space-y-2">
                                                {freeeTxns.map((txn: any, idx: number) => {
                                                    const dealAmount = Number(dealInfo?.estimated_amount) || 0
                                                    const isAmountMatch = dealAmount > 0 && Math.abs(txn.amount - dealAmount) / dealAmount <= 0.05
                                                    return (
                                                        <div key={idx} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-white transition-colors">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs text-slate-500">{txn.date}</span>
                                                                <span className="text-sm font-medium text-slate-800">{txn.description}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {isAmountMatch && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded font-medium">金額一致</span>
                                                                )}
                                                                <span className="text-sm font-bold text-emerald-600">
                                                                    +¥{txn.amount.toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                                {isFreeeLoading ? (
                                                    <span className="text-sm text-slate-500 animate-pulse">明細を検索中...</span>
                                                ) : (
                                                    <span className="text-sm text-slate-500">該当する入金明細はありません</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* 過去履歴表示セクション（折りたたみ） */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <button
                                            onClick={() => setIsDocHistoryOpen(!isDocHistoryOpen)}
                                            className="flex items-center justify-between w-full text-left"
                                        >
                                            <h3 className="text-sm font-bold text-slate-800">
                                                関連書類履歴 (freee連携)
                                                {!isDocumentsLoading && (freeeDocuments.quotations.length + freeeDocuments.invoices.length) > 0 && (
                                                    <span className="ml-2 text-xs font-normal text-slate-400">
                                                        ({freeeDocuments.quotations.length + freeeDocuments.invoices.length}件)
                                                    </span>
                                                )}
                                            </h3>
                                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDocHistoryOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isDocHistoryOpen && (
                                            <div className="mt-4">
                                                {isDocumentsLoading ? (
                                                    <div className="text-sm text-slate-500 animate-pulse text-center py-4 bg-slate-50 rounded-lg">履歴を読み込み中...</div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {freeeDocuments.quotations.length > 0 && (
                                                            <div className="space-y-2">
                                                                <h4 className="text-xs font-semibold text-slate-500">見積書</h4>
                                                                {freeeDocuments.quotations.map((q: any) => (
                                                                    <a href={getFreeeQuotationUrl(q.id, q.issue_date)} target="_blank" rel="noopener noreferrer" key={q.id} className="flex flex-col p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors block group">
                                                                        <div className="flex justify-between items-start mb-1">
                                                                            <span className="text-sm font-medium text-slate-900 group-hover:text-blue-700">{q.title || q.subject || q.quotation_number || q.description || '（件名なし）'}</span>
                                                                            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{q.quotation_status === 'issue' ? '送付済' : '未送付'}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                                                            <span>発行日: {q.issue_date || '未定'}</span>
                                                                            <span className="font-medium">¥{q.total_amount?.toLocaleString()}</span>
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {freeeDocuments.invoices.length > 0 && (
                                                            <div className="space-y-2 mt-4">
                                                                <h4 className="text-xs font-semibold text-slate-500">請求書</h4>
                                                                {freeeDocuments.invoices.map((inv: any) => (
                                                                    <a href={getFreeeInvoiceUrl(inv.id, inv.issue_date)} target="_blank" rel="noopener noreferrer" key={inv.id} className="flex flex-col p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors block group">
                                                                        <div className="flex justify-between items-start mb-1">
                                                                            <span className="text-sm font-medium text-slate-900 group-hover:text-blue-700">{inv.title || inv.subject || inv.invoice_number || inv.description || '（件名なし）'}</span>
                                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${inv.payment_status === 'settled' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{inv.payment_status === 'settled' ? '入金済' : (inv.invoice_status === 'issue' ? '送付済(未入金)' : '未送付(未入金)')}</span>
                                                                        </div>
                                                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                                                            <span>期日: {inv.due_date || '未定'}</span>
                                                                            <span className="font-medium">¥{inv.total_amount?.toLocaleString()}</span>
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {freeeDocuments.quotations.length === 0 && freeeDocuments.invoices.length === 0 && (
                                                            <div className="text-center py-6 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                                                <span className="text-sm text-slate-500">関連する書類履歴はありません</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10">
                                    <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                                        <CreditCard className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800 mb-1">freee連携未設定</h3>
                                    <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
                                        まだfreeeで見積書や請求書が作成されていません。右上のボタンから作成するか、既存の書類を検索して連携できます。
                                    </p>
                                    <div className="flex justify-center gap-3">
                                        <button
                                            onClick={() => { setShowLinkSearch('quotation'); if (companyInfo?.name) fetchFreeeDocuments(companyInfo.name); }}
                                            disabled={isFreeeLoading}
                                            className="px-4 py-2 text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            既存の見積書を検索して連携
                                        </button>
                                        <button
                                            onClick={() => { setShowLinkSearch('invoice'); if (companyInfo?.name) fetchFreeeDocuments(companyInfo.name); }}
                                            disabled={isFreeeLoading}
                                            className="px-4 py-2 text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            既存の請求書を検索して連携
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 活動とファイル */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-slate-900">この商談に関連するファイル・議事録</h2>
                            <Link href="/files" className="text-sm font-medium text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                <Plus className="w-4 h-4" /> 資料追加
                            </Link>
                        </div>
                        <div className="text-center py-6 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                            <p className="text-sm text-slate-500">この商談に関連するファイルはまだありません</p>
                        </div>
                    </div>

                    {/* 入金履歴セクション */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-emerald-600" />
                                <h2 className="text-lg font-bold text-slate-900">入金履歴</h2>
                                <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{paymentRecords.length}件</span>
                            </div>
                            <button
                                onClick={() => setShowPaymentForm(!showPaymentForm)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                入金記録を追加
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {paymentRecords.length > 0 ? (
                                <div className="space-y-3">
                                    {paymentRecords.map((record) => (
                                        <div key={record.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl bg-slate-50 hover:bg-white transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                                    <CheckCircle2 className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900">
                                                        +¥{record.amount?.toLocaleString() || '0'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                                                        <span>{record.payment_date ? new Date(record.payment_date).toLocaleDateString('ja-JP') : '日付不明'}</span>
                                                        {record.bank_name && <><span className="text-slate-300">|</span><span>{record.bank_name}</span></>}
                                                        {record.payment_method && <><span className="text-slate-300">|</span><span>{record.payment_method}</span></>}
                                                    </div>
                                                    {record.description && <div className="text-xs text-slate-400 mt-0.5">{record.description}</div>}
                                                    {record.memo && <div className="text-xs text-blue-500 mt-0.5">{record.memo}</div>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation()
                                                    if (!confirm('この入金記録を削除しますか？')) return
                                                    await deletePaymentRecord(record.id, dealId)
                                                    setPaymentRecords(prev => prev.filter(r => r.id !== record.id))
                                                }}
                                                className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
                                            >
                                                削除
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                    <p className="text-sm text-slate-500">入金履歴はまだありません</p>
                                </div>
                            )}

                            {showPaymentForm && (
                                <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                                    <h3 className="text-sm font-bold text-slate-800">入金記録を追加</h3>
                                    <form onSubmit={async (e) => {
                                        e.preventDefault()
                                        const form = e.currentTarget
                                        const fd = new FormData(form)
                                        try {
                                            await createPaymentRecord({
                                                deal_id: dealId,
                                                company_id: companyInfo?.id || null,
                                                amount: parseInt(fd.get('amount') as string, 10) || 0,
                                                payment_date: fd.get('payment_date') as string || null,
                                                bank_name: fd.get('bank_name') as string || null,
                                                payment_method: fd.get('payment_method') as string || null,
                                                description: fd.get('description') as string || null,
                                                memo: fd.get('memo') as string || null,
                                            })
                                            const payments = await getPaymentRecordsByDealId(dealId)
                                            setPaymentRecords(payments)
                                            setShowPaymentForm(false)
                                            form.reset()
                                        } catch (err) {
                                            alert('入金記録の作成に失敗しました。')
                                        }
                                    }} className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">入金額 *</label>
                                                <input name="amount" type="number" required className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm" placeholder="1000000" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">入金日</label>
                                                <input name="payment_date" type="date" className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">銀行名</label>
                                                <input name="bank_name" type="text" className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm" placeholder="伊予銀行" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">入金方法</label>
                                                <select name="payment_method" className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm">
                                                    <option value="">選択してください</option>
                                                    <option>銀行振込</option>
                                                    <option>現金</option>
                                                    <option>クレジットカード</option>
                                                    <option>その他</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">摘要</label>
                                            <input name="description" type="text" className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm" placeholder="振込人名・摘要など" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">メモ</label>
                                            <input name="memo" type="text" className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm" placeholder="備考" />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={() => setShowPaymentForm(false)} className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">キャンセル</button>
                                            <button type="submit" className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium">保存</button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 議事録セクション */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-lg font-bold text-slate-900">議事録</h2>
                                <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">{meetingNotes.length}件</span>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* 議事録一覧 */}
                            {meetingNotes.length > 0 ? (
                                <div className="space-y-3">
                                    {meetingNotes.map((note) => (
                                        <div key={note.id} className="p-4 border border-slate-200 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="text-sm font-bold text-slate-900 truncate">{note.title}</h3>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                                                        {note.meeting_date && (
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" />
                                                                {new Date(note.meeting_date).toLocaleDateString('ja-JP')}
                                                            </span>
                                                        )}
                                                        {note.contact?.name && (
                                                            <span className="flex items-center gap-1">
                                                                <Users className="w-3 h-3" />
                                                                {note.contact.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {note.memo && (
                                                        <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">{note.memo}</p>
                                                    )}
                                                    {note.note_url && (
                                                        <a href={note.note_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                                                            <FileText className="w-3 h-3" />
                                                            議事録リンク
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">この商談に関連する議事録はまだありません</p>
                                </div>
                            )}

                            {/* 議事録追加フォーム */}
                            <div className="pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-slate-800 mb-3">議事録を追加</h3>
                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault()
                                        const form = e.currentTarget
                                        const formData = new FormData(form)
                                        formData.append('deal_id', dealId)
                                        if (contactInfo?.id) formData.append('contact_id', contactInfo.id)
                                        try {
                                            await createMeetingNote(formData)
                                            // 議事録を再取得
                                            const notes = await getMeetingNotesByDealId(dealId)
                                            setMeetingNotes(notes)
                                            form.reset()
                                        } catch (err) {
                                            console.error('Failed to create meeting note:', err)
                                            alert('議事録の作成に失敗しました。')
                                        }
                                    }}
                                    className="space-y-3"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">タイトル <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                name="title"
                                                required
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                placeholder="例: 初回ヒアリング"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">日付</label>
                                            <input
                                                type="date"
                                                name="meeting_date"
                                                defaultValue={new Date().toISOString().split('T')[0]}
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">メモ</label>
                                        <textarea
                                            name="memo"
                                            rows={3}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                                            placeholder="議事メモを入力..."
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                                        >
                                            <Send className="w-4 h-4" />
                                            追加
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* 次のアクション */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-base font-bold text-slate-900">ネクストアクション設定</h2>
                        </div>
                        <div className="p-5 space-y-4">
                            {(dealInfo.next_appointment_date || dealInfo.action_plan) ? (
                                <div className="p-3 border border-amber-200 bg-amber-50 rounded-lg">
                                    {dealInfo.action_plan && (
                                        <div className="text-sm font-bold text-amber-800 mb-1">{dealInfo.action_plan}</div>
                                    )}
                                    {dealInfo.next_appointment_date && (
                                        <div className="text-xs text-amber-700">次回アポ日: {new Date(dealInfo.next_appointment_date).toLocaleDateString('ja-JP')}</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-4 bg-slate-50 border border-slate-100/50 rounded-lg border-dashed">
                                    <p className="text-sm text-slate-500">ネクストアクションが設定されていません</p>
                                    <p className="text-xs text-slate-400 mt-1">商談の編集画面から「次回アポ日」「アクションプラン」を設定できます</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Freee請求書作成モーダル */}
            <CreateFreeeInvoiceModal
                isOpen={isInvoiceModalOpen}
                onClose={() => setIsInvoiceModalOpen(false)}
                dealInfo={dealInfo}
                onSubmit={handleCreateFreeeInvoice}
            />

            {/* Freee見積書作成モーダル（既存のコンポーネントを流用） */}
            <CreateFreeeInvoiceModal
                isOpen={isQuotationModalOpen}
                onClose={() => setIsQuotationModalOpen(false)}
                dealInfo={dealInfo}
                onSubmit={handleCreateFreeeQuotation}
                isQuotation={true}
            />

            {/* freee書類検索＆再連携モーダル */}
            {showLinkSearch && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowLinkSearch(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900">
                                {showLinkSearch === 'quotation' ? 'freee見積書を検索して連携' : 'freee請求書を検索して連携'}
                            </h3>
                            <button onClick={() => setShowLinkSearch(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                                <span className="text-slate-400 text-xl leading-none">&times;</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[55vh]">
                            {isDocumentsLoading ? (
                                <div className="text-center py-8 text-slate-500 animate-pulse">freeeから書類を検索中...</div>
                            ) : (() => {
                                // 金額一致フィルタリング（社名はAPI側でpartner_idで絞り込み済み）
                                const dealAmount = Number(dealInfo?.estimated_amount) || 0;
                                const filteredQuotations = freeeDocuments.quotations.filter((q: any) => dealAmount > 0 && Number(q.total_amount) === dealAmount);
                                const filteredInvoices = freeeDocuments.invoices.filter((inv: any) => dealAmount > 0 && Number(inv.total_amount) === dealAmount);

                                return (
                                    <>
                                        <div className="mb-3 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                                            検索条件: {companyInfo?.name || '企業未設定'} / 金額 ¥{dealAmount.toLocaleString()}
                                        </div>
                                        {showLinkSearch === 'quotation' && filteredQuotations.length > 0 ? (
                                            <div className="space-y-2">
                                                {filteredQuotations.map((q: any) => (
                                                    <button
                                                        key={q.id}
                                                        onClick={() => handleLinkDocument('quotation', q.id)}
                                                        disabled={isFreeeLoading}
                                                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-sm font-medium text-slate-900">{q.title || q.subject || q.quotation_number || '（件名なし）'}</span>
                                                            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded shrink-0 ml-2">{q.quotation_status === 'issue' ? '送付済' : '未送付'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                                            <span>発行日: {q.issue_date || '未定'}</span>
                                                            <span className="font-medium">¥{q.total_amount?.toLocaleString()}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-1">ID: {q.id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : showLinkSearch === 'invoice' && filteredInvoices.length > 0 ? (
                                            <div className="space-y-2">
                                                {filteredInvoices.map((inv: any) => (
                                                    <button
                                                        key={inv.id}
                                                        onClick={() => handleLinkDocument('invoice', inv.id)}
                                                        disabled={isFreeeLoading}
                                                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                                    >
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="text-sm font-medium text-slate-900">{inv.title || inv.subject || inv.invoice_number || '（件名なし）'}</span>
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ml-2 ${inv.payment_status === 'settled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {inv.payment_status === 'settled' ? '入金済み' : '未入金'}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                                            <span>発行日: {inv.issue_date || '未定'}</span>
                                                            <span className="font-medium">¥{inv.total_amount?.toLocaleString()}</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-1">ID: {inv.id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <div className="text-slate-400 text-sm mb-2">
                                                    {!companyInfo?.name ? 'この商談に企業が設定されていません。' :
                                                     dealAmount === 0 ? '商談金額が設定されていないため検索できません。' :
                                                     `「${companyInfo.name}」で金額¥${dealAmount.toLocaleString()}に一致する${showLinkSearch === 'quotation' ? '見積書' : '請求書'}が見つかりません。`}
                                                </div>
                                                <div className="text-xs text-slate-400">freee認証が有効か確認してください。</div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* 削除確認ダイアログ */}
            {showDeleteDialog && (
                <DeleteConfirmDialog
                    title="商談を削除"
                    message={`「${dealInfo?.title}」を削除しますか？関連する議事録・入金記録も削除されます。`}
                    onConfirm={handleDeleteDeal}
                    onCancel={() => setShowDeleteDialog(false)}
                />
            )}
        </div>
    )
}

