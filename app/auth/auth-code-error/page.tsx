'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

function AuthCodeErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'missing_code':
        return 'The authentication code was missing from the callback. Please try signing in again.'
      case 'expired_link':
        return 'The email verification link has expired or is invalid. Please sign in with your email and password instead.'
      case 'unexpected_error':
        return 'An unexpected error occurred during authentication. Please try again.'
      default:
        return errorCode 
          ? `Authentication failed: ${decodeURIComponent(errorCode)}` 
          : 'An authentication error occurred. Please try signing in again.'
    }
  }

  const getErrorDetails = (errorCode: string | null) => {
    switch (errorCode) {
      case 'missing_code':
        return 'This usually happens when the OAuth provider fails to redirect properly or the authorization code gets lost.'
      case 'expired_link':
        return 'Email verification links expire after a certain time for security. You can still access your account by logging in normally with your email and password.'
      case 'unexpected_error':
        return 'This could be a temporary issue with our authentication service or a configuration problem.'
      default:
        return 'This error occurred during the OAuth authentication process. Please check your internet connection and try again.'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">
            Authentication Error
          </CardTitle>
          <CardDescription className="text-gray-600">
            {getErrorMessage(error)}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm text-gray-700">
              {getErrorDetails(error)}
            </p>
          </div>
          
          {error && (
            <div className="bg-red-50 p-3 rounded-md">
              <p className="text-xs text-red-700 font-mono">
                Error Code: {error}
              </p>
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">
                Try Again
              </Link>
            </Button>
            
            <Button variant="outline" asChild className="w-full">
              <Link href="/">
                Go Home
              </Link>
            </Button>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-gray-500">
              If this problem persists, please{' '}
              <Link href="/contact" className="text-blue-600 hover:underline">
                contact support
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthCodeErrorPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle className="text-xl font-semibold text-gray-900">
              Loading...
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    }>
      <AuthCodeErrorContent />
    </Suspense>
  )
} 