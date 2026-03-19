const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload an image buffer or URL to Cloudinary
 * @param {Buffer|string} source - File buffer or remote URL
 * @param {string} folder - Cloudinary folder path
 * @returns {{ url: string, publicId: string }}
 */
async function uploadImage(source, folder = 'fashion-cotz') {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      resource_type: 'image',
      quality: 'auto:good',
      fetch_format: 'auto',
    };

    if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('data:'))) {
      // URL or base64
      cloudinary.uploader.upload(source, uploadOptions, (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
    } else {
      // Buffer stream
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      uploadStream.end(source);
    }
  });
}

async function deleteImage(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

module.exports = { uploadImage, deleteImage };
