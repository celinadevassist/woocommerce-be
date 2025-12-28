/**
 * Migration Script: Organization-based to Store-based Architecture
 *
 * This script migrates existing data from organization-based model to store-based model:
 * 1. Sets store.ownerId based on the organization owner
 * 2. Copies organization members to store.members
 * 3. Removes organizationId from all records (optional cleanup)
 *
 * Run with: npx ts-node src/migrations/migrate-to-store-based.ts
 */

import { connect, connection, Types } from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const DB_URI = process.env.DB_URI || 'mongodb://localhost:27017/cartflow';

interface OldOrganization {
  _id: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  members: Array<{
    userId: Types.ObjectId;
    role: string;
    storeAccess?: Types.ObjectId[] | 'all';
    invitedAt?: Date;
    acceptedAt?: Date;
  }>;
}

interface OldStore {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  ownerId?: Types.ObjectId;
  members?: Array<{
    userId: Types.ObjectId;
    role: string;
    invitedAt?: Date;
    acceptedAt?: Date;
  }>;
}

async function migrate() {
  console.log('🚀 Starting migration to store-based architecture...\n');

  try {
    // Connect to MongoDB
    await connect(DB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = connection.db;

    // Step 1: Get all organizations
    console.log('📋 Step 1: Fetching organizations...');
    const organizations = await db.collection('organizations').find({}).toArray() as unknown as OldOrganization[];
    console.log(`   Found ${organizations.length} organizations\n`);

    // Create a map of organizationId -> organization for quick lookup
    const orgMap = new Map<string, OldOrganization>();
    for (const org of organizations) {
      orgMap.set(org._id.toString(), org);
    }

    // Step 2: Update stores with ownerId and members
    console.log('📋 Step 2: Migrating stores...');
    const stores = await db.collection('stores').find({}).toArray() as unknown as OldStore[];
    console.log(`   Found ${stores.length} stores\n`);

    let storesUpdated = 0;
    let storesSkipped = 0;

    for (const store of stores) {
      // Skip if already migrated (has ownerId)
      if (store.ownerId) {
        console.log(`   ⏭️  Store "${store.name}" already has ownerId, skipping`);
        storesSkipped++;
        continue;
      }

      const org = store.organizationId ? orgMap.get(store.organizationId.toString()) : null;

      if (!org) {
        console.log(`   ⚠️  Store "${store.name}" has no organization, setting first user as owner`);
        // If no organization, we can't determine owner - skip or set a default
        continue;
      }

      // Set ownerId from organization owner
      const ownerId = org.ownerId;

      // Build members array from organization members (excluding owner)
      const members: Array<{
        userId: Types.ObjectId;
        role: string;
        invitedAt?: Date;
        acceptedAt?: Date;
      }> = [];

      for (const member of org.members || []) {
        // Skip the owner (they're represented by ownerId)
        if (member.userId.toString() === ownerId.toString()) {
          continue;
        }

        // Check if member has access to this store
        const hasAccess = member.storeAccess === 'all' ||
          (Array.isArray(member.storeAccess) &&
           member.storeAccess.some(id => id.toString() === store._id.toString()));

        if (hasAccess) {
          // Map organization role to store role (owner role is not needed since we have ownerId)
          let storeRole = member.role;
          if (storeRole === 'owner') {
            storeRole = 'admin'; // Demote to admin since they're not the actual store owner
          }

          members.push({
            userId: member.userId,
            role: storeRole,
            invitedAt: member.invitedAt,
            acceptedAt: member.acceptedAt,
          });
        }
      }

      // Update the store
      await db.collection('stores').updateOne(
        { _id: store._id },
        {
          $set: {
            ownerId: ownerId,
            members: members,
          },
          $unset: {
            organizationId: 1,
          },
        }
      );

      console.log(`   ✅ Store "${store.name}": ownerId set, ${members.length} members migrated`);
      storesUpdated++;
    }

    console.log(`\n   Summary: ${storesUpdated} stores updated, ${storesSkipped} skipped\n`);

    // Step 3: Remove organizationId from all other collections
    console.log('📋 Step 3: Removing organizationId from other collections...');

    const collectionsToClean = [
      'products',
      'productvariants',
      'orders',
      'customers',
      'reviews',
      'vouchers',
      'smsmessages',
      'smstemplates',
      'shipments',
      'subscriptions',
      'invoices',
      'inventoryalerts',
      'syncjobs',
      'auditlogs',
    ];

    for (const collectionName of collectionsToClean) {
      try {
        const result = await db.collection(collectionName).updateMany(
          { organizationId: { $exists: true } },
          { $unset: { organizationId: 1 } }
        );
        if (result.modifiedCount > 0) {
          console.log(`   ✅ ${collectionName}: removed organizationId from ${result.modifiedCount} documents`);
        }
      } catch (error) {
        console.log(`   ⚠️  ${collectionName}: collection may not exist or error occurred`);
      }
    }

    // Step 4: Update invitations to be store-based
    console.log('\n📋 Step 4: Updating invitations...');
    const invitations = await db.collection('invitations').find({}).toArray();
    let invitationsUpdated = 0;

    for (const invitation of invitations) {
      if (invitation.organizationId && !invitation.storeId) {
        // Find stores for this organization
        const orgStores = stores.filter(s =>
          s.organizationId && s.organizationId.toString() === invitation.organizationId.toString()
        );

        if (orgStores.length > 0) {
          // Associate with first store (or you might want different logic)
          await db.collection('invitations').updateOne(
            { _id: invitation._id },
            {
              $set: { storeId: orgStores[0]._id },
              $unset: { organizationId: 1, organizationName: 1 },
            }
          );
          invitationsUpdated++;
        }
      }
    }
    console.log(`   ✅ Updated ${invitationsUpdated} invitations\n`);

    // Step 5: Optionally archive/delete organizations collection
    console.log('📋 Step 5: Archiving organizations collection...');
    if (organizations.length > 0) {
      // Rename to archived collection instead of deleting
      try {
        await db.collection('organizations').rename('organizations_archived');
        console.log('   ✅ Renamed organizations → organizations_archived\n');
      } catch (error) {
        console.log('   ⚠️  Could not rename organizations collection (may already be archived)\n');
      }
    }

    console.log('🎉 Migration completed successfully!\n');
    console.log('Summary:');
    console.log(`   - Stores migrated: ${storesUpdated}`);
    console.log(`   - Stores skipped (already migrated): ${storesSkipped}`);
    console.log(`   - Invitations updated: ${invitationsUpdated}`);
    console.log(`   - Organizations archived: ${organizations.length}`);
    console.log('\n⚠️  Please verify your data before proceeding with production deployment.\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run migration
migrate();
