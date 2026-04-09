import {
    Controller,
    Post,
    UseGuards,
    BadRequestException,
    Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
                type: {
                    type: 'string',
                    description: 'Entity type (profile, document, vehicle, machine)',
                    default: 'profile',
                },
                isPrivate: {
                    type: 'boolean',
                    description: 'If true, generates a secure Signed URL instead of public URL',
                    default: false,
                }
            },
            required: ['file']
        },
    })
    async uploadFile(
        @Req() req: FastifyRequest,
        @GetUser('id') userId: string,
    ) {
        // Fastify Multipart handling:
        const data = await (req as any).file();
        if (!data) {
            throw new BadRequestException('No file provided');
        }

        // Extract metadata from fields
        const type = (data.fields.type as any)?.value || (data.fields.folder as any)?.value || 'profile';
        const isPrivate = (data.fields.isPrivate as any)?.value === 'true';

        // Mime-type validation
        if (!data.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
            throw new BadRequestException('Only image files are allowed!');
        }

        // Convert stream to buffer for the Sharp upload service
        const buffer = await data.toBuffer();
        const fileMetadata = {
            buffer,
            originalname: data.filename,
            mimetype: data.mimetype,
        };

        const publicUrl = await this.uploadService.optimizeAndUploadImage(
            fileMetadata as any,
            userId,
            type as any,
            isPrivate
        );

        return {
            success: true,
            message: 'Image successfully uploaded and optimized',
            url: publicUrl,
        };
    }
}
