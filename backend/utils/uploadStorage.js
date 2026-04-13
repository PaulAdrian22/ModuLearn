const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const getStorageProvider = () => String(process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase();
const isAzureStorageEnabled = () => getStorageProvider() === 'azure';

const getLocalUploadsRoot = () => path.join(__dirname, '..', 'uploads');
const getLocalProfileUploadsDir = () => path.join(getLocalUploadsRoot(), 'profiles');
const getTemporaryProfileUploadsDir = () => path.join(os.tmpdir(), 'modulearn', 'uploads', 'profiles');

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const getMulterProfileDestination = () => {
  const targetDir = isAzureStorageEnabled() ? getTemporaryProfileUploadsDir() : getLocalProfileUploadsDir();
  return ensureDir(targetDir);
};

const safeUnlink = async (filePath) => {
  if (!filePath) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to remove temporary upload file:', error.message);
    }
  }
};

const isAbsoluteUrl = (value = '') => /^https?:\/\//i.test(String(value || ''));

const getMimeTypeFromPath = (filePath = '') => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.png') return 'image/png';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
};

const createAzureContainerClient = async () => {
  let BlobServiceClient;
  let StorageSharedKeyCredential;

  try {
    ({ BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob'));
  } catch {
    throw new Error('Azure Blob upload requires @azure/storage-blob. Run npm install in backend.');
  }

  const containerName = String(process.env.AZURE_STORAGE_CONTAINER_NAME || 'modulearn-assets').trim();
  const connectionString = String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim();
  const accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim();
  const accountKey = String(process.env.AZURE_STORAGE_ACCOUNT_KEY || '').trim();

  let blobServiceClient;

  if (connectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  } else if (accountName && accountKey) {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential);
  } else {
    throw new Error('Missing Azure storage credentials. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY.');
  }

  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists({ access: 'blob' });

  return { containerClient, containerName };
};

const uploadProfileImageFromPath = async (sourcePath, { userId } = {}) => {
  if (!sourcePath) {
    throw new Error('Missing source file path for profile upload');
  }

  const safeUserId = Number.isFinite(Number(userId)) ? Number(userId) : 0;
  const extension = path.extname(sourcePath) || '.jpg';

  if (!isAzureStorageEnabled()) {
    const localDir = ensureDir(getLocalProfileUploadsDir());
    const fileName = `${safeUserId}_${Date.now()}${extension}`;
    const destinationPath = path.join(localDir, fileName);

    if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
      await fs.promises.copyFile(sourcePath, destinationPath);
      await safeUnlink(sourcePath);
    }

    return `/uploads/profiles/${fileName}`;
  }

  const { containerClient } = await createAzureContainerClient();

  const blobName = [
    'profiles',
    `${safeUserId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extension}`
  ].join('/');

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadFile(sourcePath, {
    blobHTTPHeaders: {
      blobContentType: getMimeTypeFromPath(sourcePath)
    }
  });

  await safeUnlink(sourcePath);

  const customPublicBase = String(process.env.AZURE_STORAGE_PUBLIC_BASE_URL || '').trim();
  if (customPublicBase) {
    return `${customPublicBase.replace(/\/+$/, '')}/${blobName}`;
  }

  return blockBlobClient.url;
};

const deleteProfileImage = async (storedPath = '') => {
  const source = String(storedPath || '').trim();

  if (!source || source.includes('/avatars/')) {
    return;
  }

  if (!isAbsoluteUrl(source)) {
    const normalized = source.replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
      const localPath = path.join(__dirname, '..', normalized);
      await safeUnlink(localPath);
    }
    return;
  }

  if (!isAzureStorageEnabled()) {
    return;
  }

  try {
    const { containerClient, containerName } = await createAzureContainerClient();
    const parsed = new URL(source);
    const segments = parsed.pathname.split('/').filter(Boolean);

    // Typical blob URL: /<container>/<blobName>
    if (segments[0] === containerName) {
      segments.shift();
    }

    const blobName = segments.join('/');
    if (!blobName) {
      return;
    }

    await containerClient.deleteBlob(blobName);
  } catch (error) {
    const knownMissing = ['BlobNotFound', 'ResourceNotFound'];
    if (!knownMissing.includes(error.code)) {
      console.warn('Failed to delete Azure profile image:', error.message);
    }
  }
};

module.exports = {
  getStorageProvider,
  isAzureStorageEnabled,
  getLocalUploadsRoot,
  getMulterProfileDestination,
  uploadProfileImageFromPath,
  deleteProfileImage,
  isAbsoluteUrl
};
