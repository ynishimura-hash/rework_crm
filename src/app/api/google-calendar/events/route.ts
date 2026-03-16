import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const timeMin = searchParams.get("timeMin")
        const timeMax = searchParams.get("timeMax")

        if (!timeMin || !timeMax) {
            return NextResponse.json({ error: "timeMin and timeMax are required" }, { status: 400 })
        }

        const cookieStore = await cookies()
        const token = cookieStore.get("google_calendar_token")?.value

        if (!token) {
            return NextResponse.json({ error: "Not authenticated with Google Calendar" }, { status: 401 })
        }

        // Google Calendar Events APIからイベントを取得
        const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        calendarUrl.searchParams.set("timeMin", timeMin)
        calendarUrl.searchParams.set("timeMax", timeMax)
        calendarUrl.searchParams.set("singleEvents", "true")
        calendarUrl.searchParams.set("orderBy", "startTime")
        calendarUrl.searchParams.set("maxResults", "250")

        const response = await fetch(calendarUrl.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
            if (response.status === 401) {
                return NextResponse.json({ error: "Google Calendar token expired" }, { status: 401 })
            }
            return NextResponse.json({ error: "Failed to fetch events" }, { status: response.status })
        }

        const data = await response.json()

        const events = (data.items || []).map((item: any) => ({
            id: item.id,
            summary: item.summary || "(無題)",
            description: item.description || "",
            start: item.start?.dateTime || item.start?.date || "",
            end: item.end?.dateTime || item.end?.date || "",
            allDay: !item.start?.dateTime,
            location: item.location || "",
            meetLink: item.hangoutLink || "",
            htmlLink: item.htmlLink || "",
        }))

        return NextResponse.json({ success: true, events })
    } catch (error) {
        console.error("Error fetching Google Calendar events:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
