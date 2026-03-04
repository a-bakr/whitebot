import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './schema';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client);

export const getUser = async (id: string) => {
    const user = await db.select().from(users).where(eq(users.id, id));
    return user[0];
}
