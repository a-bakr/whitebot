import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'
import { createStripeCustomer } from '@/utils/stripe/api'
import { db } from '@/utils/db/db'
import { usersTable } from '@/utils/db/schema'
import { eq } from "drizzle-orm";
import { getRoleBasedRedirectPath } from '@/utils/auth/permissions'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()

        try {
            // Exchange the authorization code for a session using PKCE
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) {
                console.error('Error exchanging code for session:', error.message)

                // Handle specific error cases
                if (error.message.includes('invalid request') || error.message.includes('expired')) {
                    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=expired_link`)
                }

                return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`)
            }

            if (data?.user) {
                // check to see if user already exists in db
                const checkUserInDB = await db.select().from(usersTable).where(eq(usersTable.email, data.user.email!))
                const isUserInDB = checkUserInDB.length > 0 ? true : false
                if (!isUserInDB) {
                    // create Stripe customers
                    const stripeID = await createStripeCustomer(data.user.id, data.user.email!, data.user.user_metadata.full_name)
                    // Create record in DB
                    await db.insert(usersTable).values({
                        id: data.user.id,
                        name: data.user.user_metadata.full_name,
                        email: data.user.email!,
                        stripe_id: stripeID,
                        plan: 'none',
                        api_user_id: null,
                    })
                }

                // Check user role for redirection (unless a specific next path is provided)
                let redirectPath = next
                if (next === '/' || next === '/dashboard') {
                    redirectPath = await getRoleBasedRedirectPath('/dashboard', 'oauth')
                }

                const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
                const isLocalEnv = process.env.NEXT_PUBLIC_NODE_ENV === 'development'
                if (isLocalEnv) {
                    // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
                    return NextResponse.redirect(`${origin}${redirectPath}`)
                } else if (forwardedHost) {
                    return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`)
                } else {
                    return NextResponse.redirect(`${origin}${redirectPath}`)
                }
            }
        } catch (error) {
            console.error('Unexpected error during auth callback:', error)
            return NextResponse.redirect(`${origin}/auth/auth-code-error?error=unexpected_error`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error?error=missing_code`)
}