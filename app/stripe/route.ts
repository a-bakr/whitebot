import { db } from '@/utils/db/db'
import { usersTable } from '@/utils/db/schema'
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
    console.log('Webhook received')
    try {
        const response = await request.json()

        // Handle subscription created/updated events
        if (response.type === 'customer.subscription.created' || response.type === 'customer.subscription.updated') {
            const subscription = response.data.object
            const customerId = subscription.customer
            const productId = subscription.items.data[0].plan.product

            console.log('Updating user plan:', { customerId, productId })
            await db.update(usersTable).set({ plan: productId }).where(eq(usersTable.stripe_id, customerId));
        }

        // Handle subscription deleted events
        if (response.type === 'customer.subscription.deleted') {
            const subscription = response.data.object
            const customerId = subscription.customer

            console.log('Removing user plan:', { customerId })
            await db.update(usersTable).set({ plan: 'none' }).where(eq(usersTable.stripe_id, customerId));
        }

        // Process the webhook payload
    } catch (error: any) {
        return new Response(`Webhook error: ${error.message}`, {
            status: 400,
        })
    }
    return new Response('Success', { status: 200 })
}