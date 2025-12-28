import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as path from 'path';

// Define file interface to avoid @types/multer dependency
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  contentType: string;
  size: number;
}

export interface UploadOptions {
  folder?: string;
  contentType?: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

@Injectable()
export class S3UploadService {
  private s3Client: S3Client;
  private bucket: string;
  private region: string;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET');

    if (!accessKeyId || !secretAccessKey || !this.bucket) {
      console.warn('AWS S3 credentials not fully configured. S3 upload will not work.');
    }

    if (accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.s3Client = new S3Client({
        region: this.region,
      });
    }
  }

  /**
   * Upload a file to S3
   * @param file - The file buffer or Express.Multer.File
   * @param originalName - Original filename
   * @param options - Upload options
   * @returns Upload result with URL and metadata
   */
  async uploadFile(
    file: Buffer | UploadedFile,
    originalName: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    // Extract buffer and size from file
    const fileBuffer = Buffer.isBuffer(file) ? file : file.buffer;
    const fileSize = fileBuffer.length;
    const fileMimeType = Buffer.isBuffer(file) ? options.contentType : (file as UploadedFile).mimetype;

    // Validate file size
    const maxSize = options.maxSizeBytes || 10 * 1024 * 1024; // Default 10MB
    if (fileSize > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`
      );
    }

    // Validate mime type
    if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      if (!fileMimeType || !options.allowedMimeTypes.includes(fileMimeType)) {
        throw new BadRequestException(
          `File type not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`
        );
      }
    }

    // Generate unique filename
    const fileExtension = path.extname(originalName) || this.getExtensionFromMimeType(fileMimeType);
    const uniqueFilename = `${randomUUID()}${fileExtension}`;

    // Build S3 key with folder
    const folder = options.folder || 'uploads';
    const key = `${folder}/${uniqueFilename}`;

    // Determine content type
    const contentType = fileMimeType || options.contentType || 'application/octet-stream';

    // Upload to S3
    // Note: ACL removed - use bucket policy for public access instead
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    try {
      console.log(`[S3Upload] Starting upload: ${key}`);
      console.log(`[S3Upload] Bucket: ${this.bucket}, Region: ${this.region}`);
      console.log(`[S3Upload] File size: ${fileSize} bytes, Content-Type: ${contentType}`);

      await this.s3Client.send(command);

      // Build public URL
      const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      console.log(`[S3Upload] Success: ${url}`);

      return {
        url,
        key,
        bucket: this.bucket,
        contentType,
        size: fileSize,
      };
    } catch (s3Error: any) {
      console.error(`[S3Upload] Error uploading file: ${key}`);
      console.error(`[S3Upload] Error name: ${s3Error.name}`);
      console.error(`[S3Upload] Error message: ${s3Error.message}`);
      console.error(`[S3Upload] Error code: ${s3Error.Code || s3Error.$metadata?.httpStatusCode}`);

      if (s3Error.$metadata) {
        console.error(`[S3Upload] HTTP Status: ${s3Error.$metadata.httpStatusCode}`);
        console.error(`[S3Upload] Request ID: ${s3Error.$metadata.requestId}`);
      }

      // Provide user-friendly error messages
      let userMessage = 'Failed to upload file to S3';

      if (s3Error.name === 'NoSuchBucket') {
        userMessage = `S3 bucket '${this.bucket}' does not exist`;
      } else if (s3Error.name === 'AccessDenied' || s3Error.Code === 'AccessDenied') {
        userMessage = 'Access denied. Check AWS credentials and bucket permissions';
      } else if (s3Error.name === 'InvalidAccessKeyId') {
        userMessage = 'Invalid AWS Access Key ID';
      } else if (s3Error.name === 'SignatureDoesNotMatch') {
        userMessage = 'Invalid AWS Secret Access Key';
      } else if (s3Error.name === 'NetworkingError' || s3Error.code === 'ENOTFOUND') {
        userMessage = 'Network error. Check your internet connection';
      } else if (s3Error.$metadata?.httpStatusCode === 403) {
        userMessage = 'Forbidden. Check bucket policy and ACL permissions';
      }

      throw new BadRequestException(`${userMessage}: ${s3Error.message}`);
    }
  }

  /**
   * Upload an image file with image-specific validations
   */
  async uploadImage(
    file: Buffer | UploadedFile,
    originalName: string,
    folder: string = 'images'
  ): Promise<UploadResult> {
    return this.uploadFile(file, originalName, {
      folder,
      maxSizeBytes: 5 * 1024 * 1024, // 5MB for images
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
      ],
    });
  }

  /**
   * Upload a document file (PDF, etc.)
   */
  async uploadDocument(
    file: Buffer | UploadedFile,
    originalName: string,
    folder: string = 'documents'
  ): Promise<UploadResult> {
    return this.uploadFile(file, originalName, {
      folder,
      maxSizeBytes: 20 * 1024 * 1024, // 20MB for documents
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ],
    });
  }

  /**
   * Upload a profile image with specific folder and constraints
   */
  async uploadProfileImage(
    file: Buffer | UploadedFile,
    originalName: string,
    userId: string
  ): Promise<UploadResult> {
    return this.uploadFile(file, originalName, {
      folder: `profiles/${userId}`,
      maxSizeBytes: 2 * 1024 * 1024, // 2MB for profile images
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
      ],
    });
  }

  /**
   * Delete a file from S3
   * @param key - The S3 key or full URL
   */
  async deleteFile(keyOrUrl: string): Promise<void> {
    // Extract key from URL if full URL is provided
    let key = keyOrUrl;
    if (keyOrUrl.startsWith('http')) {
      const urlParts = keyOrUrl.split('.amazonaws.com/');
      if (urlParts.length > 1) {
        key = urlParts[1];
      }
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      console.log(`[S3Delete] Starting delete: ${key}`);
      console.log(`[S3Delete] Bucket: ${this.bucket}`);

      await this.s3Client.send(command);

      console.log(`[S3Delete] Success: ${key}`);
    } catch (s3Error: any) {
      console.error(`[S3Delete] Error deleting file: ${key}`);
      console.error(`[S3Delete] Error name: ${s3Error.name}`);
      console.error(`[S3Delete] Error message: ${s3Error.message}`);
      console.error(`[S3Delete] Error code: ${s3Error.Code || s3Error.$metadata?.httpStatusCode}`);

      if (s3Error.$metadata) {
        console.error(`[S3Delete] HTTP Status: ${s3Error.$metadata.httpStatusCode}`);
        console.error(`[S3Delete] Request ID: ${s3Error.$metadata.requestId}`);
      }

      // Re-throw with more context
      throw new BadRequestException(`Failed to delete file from S3: ${s3Error.message}`);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/plain': '.txt',
    };

    return mimeToExt[mimeType] || '';
  }

  /**
   * Check if S3 is properly configured
   */
  isConfigured(): boolean {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    return !!(accessKeyId && secretAccessKey && this.bucket);
  }
}
