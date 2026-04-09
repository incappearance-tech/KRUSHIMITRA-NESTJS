import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
    private supabase: SupabaseClient;
    private readonly logger = new Logger(UploadService.name);

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL')?.replace(/['"]/g, '').trim();
        const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.replace(/['"]/g, '').trim();

        this.logger.log(`Initializing Supabase with URL: [${supabaseUrl}]`);

        if (!supabaseUrl || !supabaseKey) {
            this.logger.warn('Supabase URL or Key is missing. Uploads will fail.');
        } else {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
    }

    /**
     * Processes an image via Sharp to specific resolutions
     * and uploads directly to Supabase Storage structured folders.
     */
    async optimizeAndUploadImage(
        file: { buffer: Buffer; originalname?: string; mimetype?: string },
        userId: string,
        type: 'profile' | 'document' | 'vehicle' | 'machine' = 'profile',
        isPrivate: boolean = false
    ): Promise<string> {
        try {
            // 1. Determine Resolution & Folder Structure based on Spec
            let targetWidth = 1080;
            let folderPath = '';
            let fileName = '';

            switch (type) {
                case 'profile':
                    targetWidth = 300;
                    folderPath = `profile-images/${userId}`;
                    fileName = 'profile'; // Can be overwritten
                    break;
                case 'document':
                    targetWidth = 800;
                    folderPath = `documents/${userId}`;
                    fileName = uuidv4();
                    break;
                case 'vehicle':
                    targetWidth = 1000;
                    folderPath = `vehicle-images/${userId}`;
                    fileName = uuidv4();
                    break;
                case 'machine':
                    targetWidth = 1000;
                    folderPath = `machine-images/${userId}`;
                    fileName = uuidv4();
                    break;
            }

            // 2. Optimize Image via Sharp
            const processedBuffer = await sharp(file.buffer)
                .resize({ width: targetWidth, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();

            const uniqueFilename = `${folderPath}/${fileName}.webp`;
            const bucketName = isPrivate ? 'krushimitra-private' : 'krushimitra-media';
            // 3. Upload to Supabase Storage
            const { data, error } = await this.supabase.storage
                .from(bucketName)
                .upload(uniqueFilename, processedBuffer, {
                    contentType: 'image/webp',
                    upsert: true,
                });

            if (error) {
                this.logger.error('Supabase upload error details:', JSON.stringify(error, null, 2));
                throw new InternalServerErrorException(`Failed to upload image to storage: ${error.message}`);
            }

            // 4. Return correct URL
            if (isPrivate) {
                // Generate 1-hour signed URL for private documents
                return this.getSignedUrl(bucketName, uniqueFilename, 3600);
            }

            const { data: publicUrlData } = this.supabase.storage
                .from(bucketName)
                .getPublicUrl(uniqueFilename);

            let finalUrl = publicUrlData.publicUrl;
            if (type === 'profile') {
                finalUrl = `${finalUrl}?v=${Date.now()}`;
            }

            return finalUrl;
        } catch (error: any) {
            this.logger.error('Image processing failed', error);
            throw new InternalServerErrorException(`Failed to process image: ${error?.message || error}`);
        }
    }

    /**
     * Helper to generate signed URLs for private files
     */
    async getSignedUrl(bucket: string, path: string, expiresInSeconds: number = 3600): Promise<string> {
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresInSeconds);

        if (error) {
            this.logger.error('Failed to create signed URL', error);
            throw new InternalServerErrorException('Failed to generate secure access token');
        }

        return data.signedUrl;
    }
}
