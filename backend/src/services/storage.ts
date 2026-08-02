import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'
import { v4 as uuidv4 } from 'uuid'

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

export const uploadFile = async (
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
  folder = 'products'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const publicId = `${folder}/${uuidv4()}`
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: false },
      (error, result) => {
        if (error) return reject(error)
        resolve(result!.secure_url)
      }
    )
    stream.end(buffer)
  })
}

export const deleteFile = async (url: string): Promise<void> => {
  // Extract public_id from Cloudinary URL
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
  if (!match) return
  const publicId = match[1]
  await cloudinary.uploader.destroy(publicId)
}
