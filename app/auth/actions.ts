"use server"
import { createClient } from '@/utils/supabase/server'
import { redirect } from "next/navigation"
import { revalidatePath } from 'next/cache'
import { createStripeCustomer } from '@/utils/stripe/api'
import { db } from '@/utils/db/db'
import { usersTable } from '@/utils/db/schema'
import { eq } from 'drizzle-orm'
import { getRoleBasedRedirectPath } from '@/utils/auth/permissions'

const PUBLIC_URL = process.env.NEXT_PUBLIC_WEBSITE_URL ? process.env.NEXT_PUBLIC_WEBSITE_URL : "http://localhost:3000"

export async function resetPassword(currentState: { message: string }, formData: FormData) {

    const supabase = await createClient()
    const passwordData = {
        password: formData.get('password') as string,
        confirm_password: formData.get('confirm_password') as string,
        code: formData.get('code') as string
    }
    if (passwordData.password !== passwordData.confirm_password) {
        return { message: "Passwords do not match" }
    }

    const { data } = await supabase.auth.exchangeCodeForSession(passwordData.code)

    let { error } = await supabase.auth.updateUser({
        password: passwordData.password

    })
    if (error) {
        return { message: error.message }
    }
    redirect(`/forgot-password/reset/success`)
}

export async function forgotPassword(currentState: { message: string }, formData: FormData) {

    const supabase = await createClient()
    const email = formData.get('email') as string
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${PUBLIC_URL}/forgot-password/reset` })

    if (error) {
        return { message: error.message }
    }
    redirect(`/forgot-password/success`)

}

export async function signup(currentState: { message: string }, formData: FormData) {
    const supabase = await createClient()
    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        name: formData.get('name') as string,
    }

    try {
        // Check if user exists in our database first
        const existingDBUser = await db.select().from(usersTable).where(eq(usersTable.email, data.email))

        if (existingDBUser.length > 0) {
            return { message: "An account with this email already exists. Please login instead." }
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
                emailRedirectTo: `${PUBLIC_URL}/auth/callback?next=/subscribe`,
                data: {
                    // Disable email confirmation in development for easier testing
                    // In production, you may want to enable this: email_confirm: true
                    email_confirm: false,
                    full_name: data.name
                }
            }
        })

        if (signUpError) {
            if (signUpError.message.includes("already registered")) {
                return { message: "An account with this email already exists. Please login instead." }
            }
            return { message: signUpError.message }
        }

        if (!signUpData?.user) {
            return { message: "Failed to create user" }
        }

        // create Stripe Customer Record using signup response data
        const stripeID = await createStripeCustomer(signUpData.user.id, signUpData.user.email!, data.name)

        // Create record in DB with plan set to 'none' initially
        await db.insert(usersTable).values({
            id: signUpData.user.id,
            name: data.name,
            email: signUpData.user.email!,
            stripe_id: stripeID,
            plan: 'none',
            api_user_id: null,
        })

        revalidatePath('/', 'layout')
        redirect('/subscribe')
    } catch (error) {
        // Check if this is a Next.js redirect (not a real error)
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
            throw error; // Re-throw redirect errors to let Next.js handle them
        }

        console.error('Error in signup:', error)
        return { message: "Failed to setup user account" }
    }
}

export async function loginUser(currentState: { message: string }, formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        return { message: error.message }
    }

    revalidatePath('/', 'layout')

    // Get role-based redirect path and redirect
    const redirectPath = await getRoleBasedRedirectPath('/dashboard', 'login')
    redirect(redirectPath)
}



export async function logout() {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()
    redirect('/login')
}

export async function signInWithGoogle() {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${PUBLIC_URL}/auth/callback`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        })

        if (error) {
            console.error('Error initiating Google OAuth:', error.message)
            return { error: error.message }
        }

        if (data.url) {
            return { url: data.url }
        }

        return { error: 'No redirect URL received' }
    } catch (error) {
        console.error('Failed to initiate Google OAuth:', error)
        return { error: 'Failed to initiate Google OAuth' }
    }
}

