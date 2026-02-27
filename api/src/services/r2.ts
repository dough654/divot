import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

type GenerateUploadUrlParams = {
  key: string;
  contentType: string;
  /** Presigned URL expiry in seconds. Default: 900 (15 min) */
  expiresIn?: number;
};

type GenerateDownloadUrlParams = {
  key: string;
  /** Presigned URL expiry in seconds. Default: 3600 (1 hour) */
  expiresIn?: number;
};

const DEFAULT_UPLOAD_EXPIRY = 900;
const DEFAULT_DOWNLOAD_EXPIRY = 3600;

/**
 * Creates an S3-compatible client configured for Cloudflare R2.
 */
const createR2Client = (config: R2Config) => {
  const { accountId, accessKeyId, secretAccessKey, bucketName } = config;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  /**
   * Generates a presigned PUT URL for uploading a file to R2.
   */
  const generateUploadUrl = async (params: GenerateUploadUrlParams) => {
    const { key, contentType, expiresIn = DEFAULT_UPLOAD_EXPIRY } = params;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    return { url, expiresIn };
  };

  /**
   * Generates a presigned GET URL for downloading a file from R2.
   */
  const generateDownloadUrl = async (params: GenerateDownloadUrlParams) => {
    const { key, expiresIn = DEFAULT_DOWNLOAD_EXPIRY } = params;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    return { url, expiresIn };
  };

  /**
   * Deletes an object from R2. Used when clips are deleted.
   */
  const deleteObject = async (key: string) => {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await client.send(command);
  };

  return { generateUploadUrl, generateDownloadUrl, deleteObject };
};

/**
 * Builds a storage key for a clip asset.
 *
 * @example buildStorageKey({ userId: 'u1', clipId: 'c1', type: 'video', extension: 'mp4' })
 * // => 'users/u1/clips/c1/video.mp4'
 */
const buildStorageKey = (params: {
  userId: string;
  clipId: string;
  type: 'video' | 'thumbnail';
  extension: string;
}) => {
  const { userId, clipId, type, extension } = params;
  return `users/${userId}/clips/${clipId}/${type}.${extension}`;
};

/**
 * Creates an R2 service from environment variables.
 * Returns null if R2 is not configured (allows the API to run without R2 in dev).
 */
const createR2ServiceFromEnv = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return createR2Client({ accountId, accessKeyId, secretAccessKey, bucketName });
};

export { createR2Client, createR2ServiceFromEnv, buildStorageKey };
export type { R2Config, GenerateUploadUrlParams, GenerateDownloadUrlParams };
