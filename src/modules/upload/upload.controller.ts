import {
    Controller,
    Post,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Uploads')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Post()
    @ApiOperation({ summary: 'Upload and perfectly optimize an image for production' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'The raw huge image file to be optimized into WebP',
                },
                folder: {
                    type: 'string',
                    description: 'Optional storage folder name (e.g., profiles, machines)',
                    default: 'general',
                }
            },
            required: ['file']
        },
    })
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 10 * 1024 * 1024, // Set 10MB absolute limit to prevent memory attack
            },
            fileFilter: (req, file, cb) => {
                // Only accept images
                if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
                    return cb(new BadRequestException('Only image files are allowed!'), false);
                }
                cb(null, true);
            },
        }),
    )
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @GetUser('id') userId: string,
        @Body('folder') folder?: string,
    ) {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        // Pass the raw buffer directly to our fast Sharp optimization pipeline
        const publicUrl = await this.uploadService.optimizeAndUploadImage(file, userId, folder);

        return {
            message: 'Image successfully uploaded and optimized',
            url: publicUrl,
        };
    }
}
