import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as base64 from 'base-64';
import { DateTime } from 'luxon';

@Injectable()
export class ZoomMeetingService {
  private readonly logger = new Logger(ZoomMeetingService.name);
  private readonly zoomAuthUrl = 'https://zoom.us/oauth/token';
  private readonly zoomApiUrl = 'https://api.zoom.us/v2';

  private readonly accountId = process.env.ZOOM_ACCOUNT_ID;
  private readonly clientId = process.env.ZOOM_CLIENT_ID;
  private readonly clientSecret = process.env.ZOOM_CLIENT_SECRET;

  private accessToken: string = null; // optional caching

  constructor() {
    // Log configuration status (without exposing secrets)
    this.logger.log('================================================================================');
    this.logger.log('🔧 Zoom Service Configuration Check:');
    this.logger.log(`Account ID: ${this.accountId ? '✅ Set' : '❌ Missing'}`);
    this.logger.log(`Client ID: ${this.clientId ? '✅ Set' : '❌ Missing'}`);
    this.logger.log(`Client Secret: ${this.clientSecret ? '✅ Set' : '❌ Missing'}`);
    this.logger.log('================================================================================');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      this.logger.log('♻️ Using cached Zoom access token');
      return this.accessToken;
    }

    this.logger.log('🔑 Requesting new Zoom access token...');

    // Validate credentials before making request
    if (!this.accountId || !this.clientId || !this.clientSecret) {
      this.logger.error('❌ Missing Zoom credentials in environment variables');
      this.logger.error(`Account ID: ${this.accountId ? 'Present' : 'MISSING'}`);
      this.logger.error(`Client ID: ${this.clientId ? 'Present' : 'MISSING'}`);
      this.logger.error(`Client Secret: ${this.clientSecret ? 'Present' : 'MISSING'}`);
      throw new InternalServerErrorException('Zoom credentials not configured');
    }

    const authHeader = base64.encode(`${this.clientId}:${this.clientSecret}`);
    const url = `${this.zoomAuthUrl}?grant_type=account_credentials&account_id=${this.accountId}`;

    try {
      this.logger.log(`Making auth request to: ${this.zoomAuthUrl}`);
      const response = await axios.post(
        url,
        {},
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.logger.log('✅ Zoom access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      this.logger.error('================================================================================');
      this.logger.error('❌ Zoom Authentication Error:');
      this.logger.error(`Status: ${error.response?.status}`);
      this.logger.error(`Error Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      this.logger.error(`Error Message: ${error.message}`);
      this.logger.error('================================================================================');
      throw new InternalServerErrorException(`Failed to fetch Zoom Access Token: ${error.response?.data?.message || error.message}`);
    }
  }

  async createMeeting(meetingData: {
    topic: string;
    type?: number;
    agenda?: string;
    start_time: string;
    duration?: number;
    timezone?: string;
    settings?: any;
  }): Promise<any> {
    this.logger.log('================================================================================');
    this.logger.log('📅 Creating Zoom Meeting');
    this.logger.log(`Topic: ${meetingData.topic}`);
    this.logger.log(`Start Time: ${meetingData.start_time}`);
    this.logger.log(`Duration: ${meetingData.duration || 60} minutes`);
    this.logger.log(`Timezone: ${meetingData.timezone || 'Asia/Riyadh'}`);

    const accessToken = await this.getAccessToken();

    const payload = {
      topic: meetingData.topic,
      type: meetingData.type || 2,
      start_time: meetingData.start_time,
      duration: meetingData.duration || 60,
      timezone: meetingData.timezone || 'Asia/Riyadh',
      agenda: meetingData.agenda || '',
      settings: meetingData.settings || {
        host_video: true,
        participant_video: false,
        waiting_room: false,
        approval_type: 2,
      },
    };

    this.logger.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

    try {
      this.logger.log('Making request to Zoom API...');
      const response = await axios.post(
        `${this.zoomApiUrl}/users/me/meetings`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.log('✅ Zoom meeting created successfully');
      this.logger.log(`Meeting ID: ${response.data.id}`);
      this.logger.log(`Join URL: ${response.data.join_url}`);
      this.logger.log('================================================================================');

      return response.data;
    } catch (error) {
      this.logger.error('================================================================================');
      this.logger.error('❌ Zoom API Error (Create Meeting):');
      this.logger.error(`Status: ${error.response?.status}`);
      this.logger.error(`Error Data: ${JSON.stringify(error.response?.data, null, 2)}`);
      this.logger.error(`Error Message: ${error.message}`);
      this.logger.error(`Request Payload: ${JSON.stringify(payload, null, 2)}`);
      this.logger.error('================================================================================');
      throw new BadRequestException(error.response?.data?.message || 'Failed to create Zoom meeting');
    }
  }

  async updateMeeting(meetingId: string, updateData: Partial<{
    topic: string;
    agenda: string;
    start_time: string;
    duration: number;
    timezone: string;
    settings: any;
  }>): Promise<any> {
    const accessToken = await this.getAccessToken();

    try {
      const response = await axios.patch(
        `${this.zoomApiUrl}/meetings/${meetingId}`,
        updateData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Meeting updated successfully!');
      return response.data;
    } catch (error) {
      console.error('❌ Error updating meeting:', error.response?.data || error.message);
      throw new BadRequestException('Failed to update Zoom meeting');
    }
  }

  async deleteMeeting(meetingId: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    try {
      await axios.delete(
        `${this.zoomApiUrl}/meetings/${meetingId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Meeting deleted successfully!');
    } catch (error) {
      console.error('❌ Error deleting meeting:', error.response?.data || error.message);
      throw new BadRequestException('Failed to delete Zoom meeting');
    }
  }

  async getMeeting(meetingId: string): Promise<any> {
    const accessToken = await this.getAccessToken();

    try {
      const response = await axios.get(
        `${this.zoomApiUrl}/meetings/${meetingId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Meeting fetched successfully!');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching meeting:', error.response?.data || error.message);
      throw new BadRequestException('Failed to fetch Zoom meeting');
    }
  }
}




export function buildZoomStartTime(input: {
  date: string;
  startTime: string;
  timeZone: string;
}): string {
  const logger = new Logger('buildZoomStartTime');

  logger.log('🕐 Building Zoom start time');
  logger.log(`Input - Date: ${input.date}, Start Time: ${input.startTime}, TimeZone: ${input.timeZone}`);

  const timezoneMap = {
    CAI: 'Africa/Cairo',
  };

  const mappedTimezone = timezoneMap[input.timeZone];
  if (!mappedTimezone) {
    logger.error(`❌ Unknown timezone code: ${input.timeZone}`);
    throw new Error(`Unknown timezone code: ${input.timeZone}. Valid codes: ${Object.keys(timezoneMap).join(', ')}`);
  }

  logger.log(`Mapped timezone: ${mappedTimezone}`);

  const localTime = DateTime.fromFormat(
    `${input.date} ${input.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: mappedTimezone }
  );

  if (!localTime.isValid) {
    logger.error(`❌ Invalid date or time format`);
    logger.error(`Expected format: YYYY-MM-DD HH:mm`);
    logger.error(`Received: ${input.date} ${input.startTime}`);
    logger.error(`Validation reason: ${localTime.invalidReason}`);
    throw new Error(`Invalid date or time provided. Format should be YYYY-MM-DD HH:mm`);
  }

  // Very important: drop milliseconds
  const utcTime = localTime.toUTC().startOf('minute');
  const isoString = utcTime.toISO({ suppressMilliseconds: true });

  logger.log(`✅ Successfully built start time: ${isoString}`);

  return isoString;
}

