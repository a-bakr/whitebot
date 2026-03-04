import StripePricingTable from "@/components/StripePricingTable";
import { createClient } from '@/utils/supabase/server'
import { createStripeCheckoutSession } from "@/utils/stripe/api";

export default async function Subscribe() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const checkoutSessionSecret = await createStripeCheckoutSession(user!.email!)

    return (
        <div className="flex flex-col min-h-screen bg-secondary">
            <header className="px-4 lg:px-6 h-16 flex items-center bg-white border-b border-slate-200 fixed w-full">
                <span className="font-bold text-lg">WhiteBot</span>
            </header>
            <div className="w-full py-20 lg:py-32">
                <div className="text-center py-6 md:py-10">
                    <h1 className="font-bold text-xl md:text-3xl lg:text-4xl">Pricing</h1>
                    <p className="pt-4 text-muted-foreground text-sm md:text-base">Choose a plan to get started. Cancel anytime.</p>
                </div>
                <StripePricingTable checkoutSessionSecret={checkoutSessionSecret as string} />
            </div>
        </div>
    )
}
