// Object storage for encrypted document blobs. S3-compatible, so it works with
// MinIO (docker-compose.yml), AWS S3, Cloudflare R2, etc. Configure via .env:
//   S3_ENDPOINT   e.g. http://localhost:9000 (MinIO)
//   S3_ACCESS_KEY / S3_SECRET_KEY
//   S3_BUCKET     default: medivault-documents
//   S3_REGION     default: us-east-1 (MinIO ignores it but the SDK requires one)
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET || 'medivault-documents';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true, // MinIO serves buckets as /bucket/key, not bucket.host
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

export function isStorageConfigured() {
  return Boolean(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

/** Ensure the bucket exists, creating it if needed. Call once on server startup. */
export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    if (status === 404 || err.name === 'NotFound' || err.name === 'NoSuchBucket') {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`✓ Created storage bucket "${BUCKET}"`);
    } else {
      throw err;
    }
  }
  console.log(`✓ Storage bucket "${BUCKET}" ready at ${process.env.S3_ENDPOINT || 'http://localhost:9000'}`);
}

/**
 * Upload an encrypted buffer. Returns the object key, which is stored in
 * documents.appwrite_file_id (column name kept from the earlier Appwrite backend).
 * @param {Buffer} buffer
 * @param {string} filename  Caller already prefixes a UUID; we only sanitize.
 */
export async function uploadFile(buffer, filename) {
  const key = filename.replace(/[^\w.-]+/g, '_');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/octet-stream',
  }));
  return key;
}

/** @returns {Promise<Buffer>} */
export async function downloadFile(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
