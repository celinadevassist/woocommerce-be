/**
 * Script to create a subscription for an existing store
 * Run with: npx ts-node scripts/create-subscription-for-store.ts
 */

import { connect, connection, Types } from 'mongoose';

const STORE_PRICE_PER_MONTH = 19;
const BILLING_CYCLE_DAYS = 30;

async function createSubscriptionForStore() {
  const dbUri = process.env.DB_URI;

  if (!dbUri) {
    console.error('DB_URI environment variable is required');
    process.exit(1);
  }

  await connect(dbUri);
  console.log('Connected to MongoDB');

  const db = connection.db;

  // Find the store without a subscription
  const store = await db.collection('stores').findOne({ isDeleted: false });

  if (!store) {
    console.log('No store found');
    await connection.close();
    return;
  }

  console.log(`Found store: ${store.name} (${store._id})`);

  // Check if subscription already exists
  const existingSubscription = await db.collection('subscriptions').findOne({
    storeId: store._id
  });

  if (existingSubscription) {
    console.log('Subscription already exists for this store:', existingSubscription);
    await connection.close();
    return;
  }

  // Create subscription
  const now = new Date();
  const nextInvoiceDate = new Date(now);
  nextInvoiceDate.setDate(nextInvoiceDate.getDate() + BILLING_CYCLE_DAYS);

  const subscription = {
    storeId: store._id,
    status: 'active',
    pricePerMonth: STORE_PRICE_PER_MONTH,
    currency: 'USD',
    billingCycleStart: now,
    nextInvoiceDate: nextInvoiceDate,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('subscriptions').insertOne(subscription);

  console.log('✅ Subscription created successfully!');
  console.log('   Subscription ID:', result.insertedId);
  console.log('   Store:', store.name);
  console.log('   Status: active');
  console.log('   Price: $' + STORE_PRICE_PER_MONTH + '/month');
  console.log('   Next Invoice Date:', nextInvoiceDate.toLocaleDateString());

  await connection.close();
}

createSubscriptionForStore().catch(console.error);
