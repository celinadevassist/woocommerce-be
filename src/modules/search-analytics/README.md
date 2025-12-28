# Search Analytics Module

A platform-wide module for tracking and analyzing search queries across all application endpoints.

## Purpose

This module provides a centralized way to track user search behavior, analyze search patterns, and gain insights into what users are looking for across the entire platform.

## Features

- **Universal Search Tracking**: Track searches from any module (BrandBanda, 2ZPoint, Email Marketing, etc.)
- **Deduplication**: Prevents inflated metrics by ignoring duplicate searches within 60 minutes from the same IP/user
- **Admin Analytics**: Comprehensive analytics dashboard for administrators
- **Aggregation Support**: Group searches by term to see popularity metrics
- **Flexible Filtering**: Filter by endpoint, date range, and search term

## Usage

### 1. Import the Module

In your feature module, import the `SearchAnalyticsModule`:

```typescript
import { Module } from '@nestjs/common';
import { SearchAnalyticsModule } from 'src/modules/search-analytics';

@Module({
  imports: [
    SearchAnalyticsModule,
    // ... other imports
  ],
  // ... rest of module config
})
export class YourFeatureModule {}
```

### 2. Inject the Service

In your service, inject the `SearchAnalyticsService`:

```typescript
import { Injectable } from '@nestjs/common';
import { SearchAnalyticsService } from 'src/modules/search-analytics';

@Injectable()
export class YourFeatureService {
  constructor(
    private readonly searchAnalyticsService: SearchAnalyticsService,
  ) {}

  async searchItems(searchTerm: string, ip?: string, userId?: string) {
    // ... your search logic
    const results = await this.performSearch(searchTerm);

    // Track the search
    await this.searchAnalyticsService.saveSearchQuery(
      searchTerm,
      'your-endpoint-name', // e.g., 'sessions', 'articles', 'questions'
      results.length,
      ip,
      userId
    );

    return results;
  }
}
```

## Examples by Module

### BrandBanda - Public Showcase

```typescript
// Track project searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'projects',
  results.length
);

// Track image prompt searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'image-prompts',
  results.length
);
```

### 2ZPoint Community - Sessions

```typescript
// In SessionService
async searchSessions(searchTerm: string, ip?: string) {
  const sessions = await this.sessionModel.find({
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } }
    ]
  });

  // Track the search
  await this.searchAnalyticsService.saveSearchQuery(
    searchTerm,
    'sessions',
    sessions.length,
    ip
  );

  return sessions;
}
```

### 2ZPoint Community - Articles

```typescript
// Track article searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'articles',
  results.length,
  req.ip
);
```

### 2ZPoint Community - Questions

```typescript
// Track question searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'questions',
  results.length,
  req.ip,
  user?.id
);
```

### 2ZPoint Community - Tools

```typescript
// Track tool searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'tools',
  results.length,
  req.ip
);
```

### Email Marketing

```typescript
// Track contact/email searches
await this.searchAnalyticsService.saveSearchQuery(
  searchTerm,
  'contacts',
  results.length,
  req.ip,
  user?.id
);
```

## Admin Analytics Endpoint

### Get Search Analytics

**Endpoint**: `GET /api/:lang/admin/search-analytics`

**Authentication**: Required (Admin only)

**Query Parameters**:
- `endpoint` (optional): Filter by endpoint type (e.g., 'sessions', 'articles', 'questions')
- `startDate` (optional): Start date in ISO 8601 format
- `endDate` (optional): End date in ISO 8601 format
- `page` (optional): Page number (default: 1)
- `size` (optional): Items per page (default: 20)
- `groupByTerm` (optional): Group results by search term (default: false)

**Examples**:

```bash
# Get all search queries with pagination
GET /api/en/admin/search-analytics?page=1&size=20

# Get searches for a specific endpoint
GET /api/en/admin/search-analytics?endpoint=sessions&page=1&size=20

# Get aggregated search terms
GET /api/en/admin/search-analytics?groupByTerm=true

# Filter by date range
GET /api/en/admin/search-analytics?startDate=2025-01-01T00:00:00.000Z&endDate=2025-12-31T23:59:59.999Z

# Combine filters
GET /api/en/admin/search-analytics?endpoint=articles&groupByTerm=true&startDate=2025-10-01T00:00:00.000Z
```

**Response (Individual Records)**:
```json
{
  "data": [
    {
      "_id": "...",
      "searchTerm": "brand messaging",
      "endpoint": "sessions",
      "resultCount": 5,
      "metadata": {
        "ip": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      },
      "createdAt": "2025-10-21T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "size": 20,
    "totalPages": 8
  },
  "summary": {
    "totalSearches": 150,
    "uniqueSearchTerms": 85,
    "averageResultCount": 4.2
  }
}
```

**Response (Grouped by Term)**:
```json
{
  "data": [
    {
      "searchTerm": "brand messaging",
      "endpoint": "sessions",
      "searchCount": 45,
      "totalResults": 225,
      "averageResults": 5.0,
      "firstSearched": "2025-01-15T10:00:00.000Z",
      "lastSearched": "2025-10-21T14:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 85,
    "page": 1,
    "size": 20,
    "totalPages": 5
  },
  "summary": {
    "totalSearches": 150,
    "uniqueSearchTerms": 85,
    "averageResultCount": 4.2
  }
}
```

## Supported Endpoints

You can track searches for any endpoint. Common endpoints include:

### BrandBanda
- `projects` - Project showcase searches
- `image-prompts` - Image prompt searches
- `brand-messages` - Brand message searches
- `products` - Product searches

### 2ZPoint Community
- `sessions` - Session/event searches
- `articles` - Article searches
- `questions` - Question searches
- `answers` - Answer searches
- `tools` - Tool/resource searches
- `quotes` - Quote searches

### Email Marketing
- `contacts` - Contact searches
- `groups` - Group searches
- `templates` - Template searches

## Database Schema

The search queries are stored in the `searchQueries` collection with the following structure:

```typescript
{
  searchTerm: string;        // The search term used
  endpoint: string;          // The endpoint being searched
  resultCount: number;       // Number of results returned
  userId?: string;           // User ID (if authenticated)
  metadata: {
    ip?: string;             // Client IP address
    userAgent?: string;      // Browser user agent
    language?: string;       // Search language
  };
  createdAt: Date;           // When the search was performed
}
```

## Deduplication Logic

The service automatically deduplicates searches to prevent inflated analytics:

- **Time Window**: 60 minutes
- **Matching Criteria**: Same search term + endpoint + (IP or userId)
- **Behavior**: If a duplicate is detected within the window, the new search is not saved

This ensures accurate analytics while allowing the same user to search again after the deduplication window expires.

## Best Practices

1. **Always pass the endpoint name**: Use clear, consistent endpoint names across your module
2. **Track result count**: Always pass the number of results to understand search effectiveness
3. **Include IP when possible**: Helps with deduplication and geographic analysis
4. **Include userId for authenticated searches**: Provides user-level insights
5. **Use consistent naming**: Use kebab-case for endpoint names (e.g., 'image-prompts', not 'ImagePrompts')

## Error Handling

The `saveSearchQuery` method catches and logs errors internally to prevent search tracking from breaking the main search functionality. Failed analytics tracking will not throw errors.
