"use client"

import { FaGoogle } from "react-icons/fa";
import { signInWithGoogle } from '@/app/auth/actions'
import { Button } from "@/components/ui/button"
import { useState } from "react"

export default function ProviderSigninBlock() {
    const [isLoading, setIsLoading] = useState(false)

    const handleGoogleSignIn = async () => {
        setIsLoading(true)
        try {
            const result = await signInWithGoogle()
            if (result.url) {
                window.location.href = result.url
            } else if (result.error) {
                console.error('Google sign-in error:', result.error)
            }
        } catch (error) {
            console.error('Failed to initiate Google sign-in:', error)
        }
        setIsLoading(false)
    }

    return (
        <>
            <div className="flex flex-row gap-2">
                <Button
                    variant="outline"
                    aria-label="Sign in with Google"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full basis-full"
                >
                    <FaGoogle />
                    {isLoading && <span className="ml-2">...</span>}
                </Button>
            </div>
        </>
    )
}
