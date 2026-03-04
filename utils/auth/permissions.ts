import { createClient } from '@/utils/supabase/server';
import { db } from '@/utils/db/db';
import { usersTable } from '@/utils/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Check if the current authenticated user has admin role
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function isUserAdmin(): Promise<boolean> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return false;
        }

        // Get user from database to check role
        const dbUser = await db
            .select({ role: usersTable.role })
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);

        return dbUser.length > 0 && dbUser[0].role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

/**
 * Get the current user's role from database
 * @returns Promise<string | null> - user role or null if not found
 */
export async function getCurrentUserRole(): Promise<string | null> {
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            return null;
        }

        // Get user from database to check role
        const dbUser = await db
            .select({ role: usersTable.role })
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);

        return dbUser.length > 0 ? dbUser[0].role : null;
    } catch (error) {
        console.error('Error getting user role:', error);
        return null;
    }
}

/**
 * Check if user has specific role
 * @param requiredRole - The role to check for
 * @returns Promise<boolean> - true if user has the required role
 */
export async function hasRole(requiredRole: string): Promise<boolean> {
    const userRole = await getCurrentUserRole();
    return userRole === requiredRole;
}

/**
 * Get role-based redirect path for authenticated user
 * @param fallbackPath - Default path if role check fails (default: '/dashboard')
 * @param logContext - Context for logging (e.g., 'login', 'oauth')
 * @returns Promise<string> - The redirect path based on user role
 */
export async function getRoleBasedRedirectPath(
    fallbackPath: string = '/dashboard',
    logContext: string = 'auth'
): Promise<string> {
    try {
        const userRole = await getCurrentUserRole();
        console.log(`${logContext} userRole:`, userRole);

        if (userRole === 'admin') {
            return '/admin';
        } else {
            return '/dashboard';
        }
    } catch (error) {
        console.error(`Error checking user role in ${logContext}:`, error);
        return fallbackPath;
    }
} 