import bcrypt from 'bcryptjs';
import {PrismaClient}  from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const rounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@rentnest.com').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

async function main() {
  // ---- Admin (idempotent: re-running resets the password to the configured one) ----
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: await bcrypt.hash(adminPassword, rounds), role: 'ADMIN', status: 'ACTIVE' },
    create: {
      name: process.env.ADMIN_NAME ?? 'RentNest Admin',
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, rounds),
      role: 'ADMIN',
    },
  });

  // ---- Categories ----
  const categoryNames = ['Apartment', 'House', 'Studio', 'Villa', 'Room', 'Duplex'];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name, description: `${name} for rent` } });
    categories.set(name, c.id);
  }

  // ---- Demo landlord, tenant and listings (skipped if the landlord already has listings) ----
  const demoPassword = await bcrypt.hash('Demo@12345', rounds);
  const landlord = await prisma.user.upsert({
    where: { email: 'landlord@rentnest.com' },
    update: {},
    create: { name: 'Demo Landlord', email: 'landlord@rentnest.com', password: demoPassword, role: 'LANDLORD', phone: '+8801700000001' },
  });
  await prisma.user.upsert({
    where: { email: 'tenant@rentnest.com' },
    update: {},
    create: { name: 'Demo Tenant', email: 'tenant@rentnest.com', password: demoPassword, role: 'TENANT', phone: '+8801700000002' },
  });

  if ((await prisma.property.count({ where: { landlordId: landlord.id } })) === 0) {
    await prisma.property.createMany({
      data: [
        { title: 'Sunny 3-bed apartment in Gulshan', description: 'Spacious apartment with a lake view, close to restaurants and schools.', address: 'Road 41, Gulshan 2', city: 'Dhaka', price: 450, bedrooms: 3, bathrooms: 2, areaSqft: 1650, amenities: ['wifi', 'parking', 'lift', 'generator'], images: [], landlordId: landlord.id, categoryId: categories.get('Apartment')! },
        { title: 'Cozy studio near Dhanmondi Lake', description: 'Fully furnished studio ideal for a single professional or student.', address: 'Road 8A, Dhanmondi', city: 'Dhaka', price: 220, bedrooms: 1, bathrooms: 1, areaSqft: 520, amenities: ['wifi', 'furnished', 'ac'], images: [], landlordId: landlord.id, categoryId: categories.get('Studio')! },
        { title: 'Family house with garden', description: 'Quiet two-storey house with a private garden and rooftop terrace.', address: 'Lane 5, Agrabad', city: 'Chattogram', price: 380, bedrooms: 4, bathrooms: 3, areaSqft: 2400, amenities: ['garden', 'parking', 'security'], images: [], landlordId: landlord.id, categoryId: categories.get('House')! },
      ],
    });
  }

  console.log('Seed complete.');
  console.log(`  Admin    : ${adminEmail} / ${adminPassword}`);
  console.log('  Landlord : landlord@rentnest.com / Demo@12345');
  console.log('  Tenant   : tenant@rentnest.com / Demo@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
