import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { db } from '@/utils/db/db'
import { users } from '@/utils/db/schema'
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')

    if (code) {
        const supabase = await createClient()

        try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) {
                console.error('Error exchanging code for session:', error.message)

                if (error.message.includes('invalid request') || error.message.includes('expired')) {
                    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=expired_link`)
                }

                return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`)
            }

            if (data?.user) {
                const existingUser = await db.select().from(users).where(eq(users.email, data.user.email!))
                if (existingUser.length === 0) {
                    await db.insert(users).values({
                        id: data.user.id,
                        name: data.user.user_metadata.full_name,
                        email: data.user.email!,
                    })
                }

                const forwardedHost = request.headers.get('x-forwarded-host')
                const isLocalEnv = process.env.NEXT_PUBLIC_NODE_ENV === 'development'
                if (isLocalEnv) {
                    return NextResponse.redirect(`${origin}/dashboard`)
                } else if (forwardedHost) {
                    return NextResponse.redirect(`https://${forwardedHost}/dashboard`)
                } else {
                    return NextResponse.redirect(`${origin}/dashboard`)
                }
            }
        } catch (error) {
            console.error('Unexpected error during auth callback:', error)
            return NextResponse.redirect(`${origin}/auth/auth-code-error?error=unexpected_error`)
        }
    }

    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=missing_code`)
}
