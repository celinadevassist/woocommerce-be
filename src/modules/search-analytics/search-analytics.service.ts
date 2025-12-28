import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchAnalyticsQueryDto } from './dto/search-analytics.dto';

@Injectable()
export class SearchAnalyticsService {
  constructor(
    @InjectModel('SearchQuery') private readonly searchQueryModel: Model<any>,
  ) {}

  /**
   * Save search query for analytics with deduplication
   * Only saves if the same term hasn't been searched in the last 60 minutes
   * This prevents inflated analytics from repeated searches
   *
   * @param searchTerm - The search term used
   * @param endpoint - The endpoint being searched (e.g., 'projects', 'sessions', 'articles', 'questions')
   * @param resultCount - Number of results returned
   * @param ip - Client IP address for deduplication
   * @param userId - User ID if authenticated
   */
  async saveSearchQuery(
    searchTerm: string,
    endpoint: string,
    resultCount: number = 0,
    ip?: string,
    userId?: string
  ): Promise<void> {
    try {
      // Deduplication window: 60 minutes
      const deduplicationWindow = 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - deduplicationWindow);

      // Build deduplication query
      const dedupeQuery: any = {
        searchTerm,
        endpoint,
        createdAt: { $gte: cutoffTime }
      };

      // Add IP or userId to deduplication if available
      if (ip) {
        dedupeQuery['metadata.ip'] = ip;
      } else if (userId) {
        dedupeQuery.userId = userId;
      }

      // Check if same search was made recently
      const recentSearch = await this.searchQueryModel.findOne(dedupeQuery);

      // Only save if no recent duplicate found
      if (!recentSearch) {
        await this.searchQueryModel.create({
          searchTerm,
          endpoint,
          resultCount,
          userId,
          metadata: {
            ip
          },
          createdAt: new Date()
        });
      }
    } catch (error) {
      // Don't throw error to avoid breaking the main functionality
      console.error('Error saving search query:', error);
    }
  }

  /**
   * Get search analytics (Admin only)
   * Returns analytics data about search queries
   */
  async getSearchAnalytics(query: SearchAnalyticsQueryDto) {
    const page = query.page || 1;
    const size = query.size || 20;
    const skip = (page - 1) * size;

    // Build match query
    const matchQuery: any = {};

    if (query.endpoint) {
      matchQuery.endpoint = query.endpoint;
    }

    if (query.startDate || query.endDate) {
      matchQuery.createdAt = {};
      if (query.startDate) {
        matchQuery.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        matchQuery.createdAt.$lte = new Date(query.endDate);
      }
    }

    // If groupByTerm is true, return aggregated data
    if (query.groupByTerm) {
      const aggregatedData = await this.searchQueryModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              searchTerm: '$searchTerm',
              endpoint: '$endpoint'
            },
            count: { $sum: 1 },
            totalResults: { $sum: '$resultCount' },
            avgResults: { $avg: '$resultCount' },
            firstSearched: { $min: '$createdAt' },
            lastSearched: { $max: '$createdAt' }
          }
        },
        { $sort: { count: -1 } },
        { $skip: skip },
        { $limit: size }
      ]);

      const totalCountPipeline = await this.searchQueryModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              searchTerm: '$searchTerm',
              endpoint: '$endpoint'
            }
          }
        },
        { $count: 'total' }
      ]);

      const total = totalCountPipeline[0]?.total || 0;

      const formattedData = aggregatedData.map(item => ({
        searchTerm: item._id.searchTerm,
        endpoint: item._id.endpoint,
        searchCount: item.count,
        totalResults: item.totalResults,
        averageResults: Math.round(item.avgResults * 100) / 100,
        firstSearched: item.firstSearched,
        lastSearched: item.lastSearched
      }));

      // Get summary statistics
      const summaryPipeline = await this.searchQueryModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalSearches: { $sum: 1 },
            uniqueSearchTerms: { $addToSet: '$searchTerm' },
            totalResults: { $sum: '$resultCount' }
          }
        }
      ]);

      const summary = summaryPipeline[0] || {
        totalSearches: 0,
        uniqueSearchTerms: [],
        totalResults: 0
      };

      return {
        data: formattedData,
        pagination: {
          total,
          page,
          size,
          totalPages: Math.ceil(total / size)
        },
        summary: {
          totalSearches: summary.totalSearches,
          uniqueSearchTerms: summary.uniqueSearchTerms.length,
          averageResultCount: summary.totalSearches > 0
            ? Math.round((summary.totalResults / summary.totalSearches) * 100) / 100
            : 0
        }
      };
    }

    // Otherwise, return individual search records
    const total = await this.searchQueryModel.countDocuments(matchQuery);
    const searches = await this.searchQueryModel
      .find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(size)
      .lean();

    // Get summary statistics
    const summaryPipeline = await this.searchQueryModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          uniqueSearchTerms: { $addToSet: '$searchTerm' },
          totalResults: { $sum: '$resultCount' }
        }
      }
    ]);

    const summary = summaryPipeline[0] || {
      totalSearches: 0,
      uniqueSearchTerms: [],
      totalResults: 0
    };

    return {
      data: searches,
      pagination: {
        total,
        page,
        size,
        totalPages: Math.ceil(total / size)
      },
      summary: {
        totalSearches: summary.totalSearches,
        uniqueSearchTerms: summary.uniqueSearchTerms.length,
        averageResultCount: summary.totalSearches > 0
          ? Math.round((summary.totalResults / summary.totalSearches) * 100) / 100
          : 0
      }
    };
  }
}
