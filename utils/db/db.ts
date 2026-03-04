import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { usersTable } from './schema';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client);

export const getUser = async (id: string) => {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user[0];
}
