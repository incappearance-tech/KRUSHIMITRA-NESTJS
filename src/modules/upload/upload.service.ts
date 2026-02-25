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
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'); // Use service key for admin uploads

        if (!supabaseUrl || !supabaseKey) {
            this.logger.warn('Supabase URL or Key is missing. Uploads will fail.');
        } else {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        }
    }

    /**
     * Processes an image via Sharp to standard 1080p Webp
     * and uploads directly to Supabase Storage.
     */
    async optimizeAndUploadImage(
        file: Express.Multer.File,
        userId: string,
        folder: string = 'general',
    ): Promise<string> {
        try {
            // 1. Optimize Image via Sharp
            const processedBuffer = await sharp(file.buffer)
                .resize({ width: 1080, withoutEnlargement: true }) // Max width 1080px, don't upscale small images
                .webp({ quality: 80 }) // Convert to webp at 80% quality
                .toBuffer();

            // 2. Generate an overwritable filename for profiles, otherwise random
            let filename = uuidv4();
            if (folder === 'profiles') {
                filename = userId;
            }
            const uniqueFilename = `${folder}/${filename}.webp`;

            // 3. Upload to Supabase Bucket ('krushimitra-media')
            const { data, error } = await this.supabase.storage
                .from('krushimitra-media') // Change this to your actual bucket name
                .upload(uniqueFilename, processedBuffer, {
                    contentType: 'image/webp',
                    upsert: true,
                });

            if (error) {
                this.logger.error('Supabase upload error', error);
                throw new InternalServerErrorException('Failed to upload image to storage');
            }

            // 4. Return the public URL (append cache-busting timestamp for overwritable files)
            const { data: publicUrlData } = this.supabase.storage
                .from('krushimitra-media')
                .getPublicUrl(data.path);

            let finalUrl = publicUrlData.publicUrl;
            if (folder === 'profiles') {
                finalUrl = `${finalUrl}?v=${Date.now()}`;
            }

            return finalUrl;
        } catch (error: any) {
            this.logger.error('Image processing failed', error);
            throw new InternalServerErrorException(`Failed to process image: ${error?.message || error}`);
        }
    }
}
